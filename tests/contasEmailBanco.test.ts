import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, describe, it } from "node:test";
import { defContas } from "@/lib/contasLista";
import { lerConsulta } from "@/lib/listagem";
import type { Conta } from "@/lib/contas";

const url = process.env.TEST_PORTAL_DATABASE_URL;

describe("estados de e-mail no PostgreSQL", { skip: !url }, async () => {
  process.env.PORTAL_DATABASE_URL = url;
  process.env.PORTAL_DB_POOL_MAX = "1";
  const contas = await import("@/lib/contas");
  const pool = contas.poolPortal();
  const ddl = await readFile(new URL("../migrations/portal/202610290001_email_verification.sql", import.meta.url), "utf8");
  const senha = "senha-exclusiva-do-teste-local";
  const senhaHash = await contas.hashSenha(senha);
  const bloqueio = new Date("2026-10-29T12:30:00-03:00");
  const inserir = () => pool.query(
    "INSERT INTO portal_clients (id,nome,email,role,senha_hash) VALUES ('legado','Conta local','local@example.invalid','CLIENT',$1)", [senhaHash],
  );
  const estados = (conta: Conta | null) => {
    assert.ok(conta);
    return [conta.emailVerificado, conta.mfaEmailAtivo, conta.mfaEmailBloqueadoAte?.toISOString() ?? null];
  };
  const marcar = () => pool.query(
    "UPDATE portal_clients SET email_verificado=true, mfa_email_ativo=true, mfa_email_bloqueado_ate=$1 WHERE id='legado'", [bloqueio],
  );

  before(async () => {
    // A conexão única conserva a tabela temporária e não altera a tabela real.
    await pool.query(`CREATE TEMPORARY TABLE portal_clients (
      id text PRIMARY KEY, nome text NOT NULL, email text NOT NULL UNIQUE, cpf text, telefone text,
      role text NOT NULL, senha_hash text NOT NULL, senha_provisoria boolean NOT NULL DEFAULT false,
      criado_em timestamp NOT NULL DEFAULT now(), atualizado_em timestamp NOT NULL DEFAULT now(),
      ativo boolean NOT NULL DEFAULT true, organization_id text, ultimo_acesso_em timestamp
    )`);
    await inserir();
    await pool.query(ddl);
    const { rows } = await pool.query("SELECT email_verificado,mfa_email_ativo,mfa_email_bloqueado_ate,senha_hash FROM portal_clients");
    assert.deepEqual(rows, [{ email_verificado: false, mfa_email_ativo: false, mfa_email_bloqueado_ate: null, senha_hash: senhaHash }]);
  });
  beforeEach(async () => { await pool.query("TRUNCATE pg_temp.portal_clients"); await inserir(); });
  after(async () => { await pool.end(); });

  it("novas contas começam sem confirmação, MFA por e-mail ou bloqueio", async () => {
    const criada = await contas.criarConta({ nome: "Nova conta", email: " NOVA@example.invalid ", role: "CLIENT" });
    assert.deepEqual(estados(criada.conta), [false, false, null]);
    assert.equal(criada.conta.email, "nova@example.invalid");
    assert.equal(criada.conta.senhaProvisoria, true);
    assert.deepEqual(estados(await contas.autenticar(criada.conta.email, criada.senha)), [false, false, null]);
  });

  it("todas as projeções preservam estados e o instante do bloqueio sem expor senha", async () => {
    await marcar();
    const pagina = await contas.consultarPaginaDeContas(lerConsulta({}, defContas([])), "");
    const resultados = [
      await contas.buscarConta("legado"), await contas.buscarContaPorEmail(" LOCAL@EXAMPLE.INVALID "),
      await contas.autenticar("local@example.invalid", senha),
      ...(await contas.listarContas()), ...(await contas.listarTodasAsContas()).contas, ...pagina.pagina.itens,
    ];
    for (const conta of resultados) {
      assert.deepEqual(estados(conta), [true, true, bloqueio.toISOString()]);
      assert.equal("senha_hash" in conta!, false);
    }
  });

  it("editar outros dados ou normalizar o mesmo endereço preserva a confirmação", async () => {
    await marcar();
    for (const dados of [{ nome: "Nome alterado" }, { email: " LOCAL@EXAMPLE.INVALID " }]) {
      assert.deepEqual(estados(await contas.atualizarConta("legado", dados)), [true, true, bloqueio.toISOString()]);
    }
  });

  it("trocar o endereço limpa os três estados no mesmo UPDATE", async () => {
    await marcar();
    const alterada = await contas.atualizarConta("legado", { email: "OUTRO@example.invalid", nome: "Outro nome" });
    assert.deepEqual(estados(alterada), [false, false, null]);
    assert.equal(alterada?.email, "outro@example.invalid");
    assert.deepEqual(estados(await contas.buscarConta("legado")), [false, false, null]);
  });

  it("mutações de atividade e empresa devolvem os estados completos", async () => {
    await marcar();
    assert.deepEqual(estados(await contas.definirAtiva("legado", false)), [true, true, bloqueio.toISOString()]);
    assert.equal(await contas.autenticar("local@example.invalid", senha), null);
    assert.deepEqual(estados(await contas.vincularOrganizacao("legado", "empresa-local")), [true, true, bloqueio.toISOString()]);
  });

  it("reaplicar a migração preserva estados já gravados", async () => {
    await marcar();
    await pool.query(ddl);
    assert.deepEqual(estados(await contas.buscarConta("legado")), [true, true, bloqueio.toISOString()]);
  });

  it("o banco recusa null nos estados booleanos e mantém a conta", async () => {
    // pool.query descarta a conexão após erro; fixá-la conserva a tabela temporária.
    const conexao = await pool.connect();
    try {
      await assert.rejects(conexao.query("UPDATE portal_clients SET email_verificado=NULL WHERE id='legado'"), { code: "23502" });
      await assert.rejects(conexao.query("UPDATE portal_clients SET mfa_email_ativo=NULL WHERE id='legado'"), { code: "23502" });
    } finally { conexao.release(); }
    assert.deepEqual(estados(await contas.buscarConta("legado")), [false, false, null]);
  });
});
