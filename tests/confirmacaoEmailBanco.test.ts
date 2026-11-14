import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { after, before, beforeEach, describe, it } from "node:test";
import pg from "pg";

const conexao = process.env.TEST_PORTAL_DATABASE_URL;
describe("confirmação do e-mail no PostgreSQL", { skip: !conexao }, async () => {
  const schema = `confirmacao_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(conexao ?? "postgresql://127.0.0.1/unused");
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.PORTAL_DATABASE_URL = url.href;
  process.env.PORTAL_DB_POOL_MAX = "4";
  const { poolPortal } = await import("@/lib/contas");
  const { solicitarConfirmacaoEmail: solicitar, confirmarEmail: confirmar, estadoConfirmacaoEmail: estado } = await import("@/lib/confirmacaoEmail");
  const sql = new pg.Client({ connectionString: conexao });
  const agora = new Date("2026-11-14T12:00:00Z");
  const depois = (segundos: number) => new Date(agora.getTime() + segundos * 1000);
  let criou = false;
  const emitir = async (tempo = agora) => {
    const resultado = await solicitar("pessoa", "pessoa@example.test", tempo);
    assert.equal(resultado.tipo, "enviar");
    assert.ok(resultado.tipo === "enviar");
    assert.ok(resultado.token);
    return resultado.token!;
  };
  const conta = async () => (await sql.query("SELECT * FROM portal_clients WHERE id='pessoa'")).rows[0];
  const desafio = async () => (await sql.query("SELECT * FROM portal_email_confirmacoes WHERE conta_id='pessoa'")).rows[0];
  before(async () => {
    await sql.connect(); await sql.query(`CREATE SCHEMA ${schema}`); criou = true;
    await sql.query(`SET search_path TO ${schema}`);
    await sql.query(`CREATE TABLE portal_clients (id text PRIMARY KEY, nome text NOT NULL, email text NOT NULL,
      ativo boolean NOT NULL DEFAULT true, role text NOT NULL DEFAULT 'CLIENT', atualizado_em timestamp NOT NULL DEFAULT now())`);
    const raiz = new URL("../migrations/portal/", import.meta.url);
    for (const nome of (await readdir(raiz)).filter((n) => n.endsWith(".sql")).sort()) await sql.query(await readFile(new URL(nome, raiz), "utf8"));
  });
  beforeEach(async () => {
    await sql.query("TRUNCATE portal_clients, portal_email_confirmacoes");
    await sql.query("INSERT INTO portal_clients(id,nome,email) VALUES ('pessoa','Pessoa','pessoa@example.test'),('outra','Outra','outra@example.test')");
  });
  after(async () => {
    await poolPortal().end();
    try { if (criou) await sql.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await sql.end(); }
  });
  it("emite token aleatório, guarda somente hash e GET não confirma a conta", async () => {
    const token = await emitir();
    assert.match(token, /^[a-f0-9]{64}$/);
    const gravado = await desafio();
    assert.equal(gravado.token_hash, createHash("sha256").update(token).digest("hex"));
    assert.notEqual(gravado.token_hash, token);
    assert.equal(gravado.expira_em.getTime() - gravado.criado_em.getTime(), 30 * 60_000);
    assert.equal(await estado(token, agora), "valido");
    assert.equal((await conta()).email_verificado, false);
  });
  it("confirma somente a conta do token sem alterar papel ou ativar MFA", async () => {
    const token = await emitir();
    assert.equal((await confirmar(token, depois(10))).tipo, "confirmado");
    assert.equal((await conta()).email_verificado, true);
    assert.equal((await conta()).mfa_email_ativo, false);
    assert.equal((await conta()).role, "CLIENT");
    assert.equal((await sql.query("SELECT email_verificado FROM portal_clients WHERE id='outra'")).rows[0].email_verificado, false);
  });
  it("recusa token expirado e preserva a conta", async () => {
    const token = await emitir();
    assert.equal((await confirmar(token, depois(1800))).tipo, "invalido");
    assert.equal((await conta()).email_verificado, false);
    assert.equal((await desafio()).usado_em, null);
  });
  it("consumo repetido é recusado e concorrência só tem um vencedor", async () => {
    const token = await emitir();
    const resultados = await Promise.all(Array.from({ length: 4 }, () => confirmar(token, depois(1))));
    assert.equal(resultados.filter((r) => r.tipo === "confirmado").length, 1);
    assert.equal(resultados.filter((r) => r.tipo === "usado").length, 3);
    assert.equal(await estado(token, depois(2)), "usado");
  });
  it("reservas concorrentes emitem uma única mensagem por minuto", async () => {
    const resultados = await Promise.all(Array.from({ length: 5 }, () => solicitar("pessoa", "pessoa@example.test", agora)));
    assert.equal(resultados.filter((r) => r.tipo === "enviar").length, 1);
    assert.equal(resultados.filter((r) => r.tipo === "aguardar").length, 4);
    assert.equal((await desafio()).envios, 1);
  });
  it("novo envio invalida o link anterior e respeita três envios por hora", async () => {
    const antigo = await emitir();
    const atual = await emitir(depois(61));
    assert.notEqual(atual, antigo);
    assert.equal(await estado(antigo, depois(62)), "invalido");
    await emitir(depois(122));
    assert.equal((await solicitar("pessoa", "pessoa@example.test", depois(183))).tipo, "aguardar");
    await emitir(depois(3601));
    assert.equal((await desafio()).envios, 1);
  });
  it("trocar e voltar ao mesmo endereço não recupera a validade do token", async () => {
    const token = await emitir(); const versao = (await conta()).email_confirmacao_versao;
    await sql.query("UPDATE portal_clients SET email='novo@example.test' WHERE id='pessoa'");
    await sql.query("UPDATE portal_clients SET email='pessoa@example.test' WHERE id='pessoa'");
    assert.notEqual((await conta()).email_confirmacao_versao, versao);
    assert.equal((await confirmar(token, depois(1))).tipo, "invalido");
    assert.equal((await conta()).email_verificado, false);
  });
  it("o gatilho invalida confirmação/MFA de escritores externos ao trocar o endereço", async () => {
    await sql.query("UPDATE portal_clients SET email_verificado=true,mfa_email_ativo=true,mfa_email_bloqueado_ate=now() WHERE id='pessoa'");
    await sql.query("UPDATE portal_clients SET email='outronome@example.test' WHERE id='pessoa'");
    const c = await conta(); assert.equal(c.email_verificado, false); assert.equal(c.mfa_email_ativo, false); assert.equal(c.mfa_email_bloqueado_ate, null);
  });
  it("normalização do mesmo e-mail e alteração de perfil preservam o desafio", async () => {
    const token = await emitir();
    await sql.query("UPDATE portal_clients SET email=' PESSOA@example.test ',nome='Novo nome',atualizado_em=now() WHERE id='pessoa'");
    assert.equal((await confirmar(token, depois(1))).tipo, "confirmado");
  });
  it("conta bloqueada, ausente ou sessão com endereço antigo não recebe mensagem", async () => {
    assert.equal((await solicitar("pessoa", "antigo@example.test", agora)).tipo, "invalida");
    assert.equal((await solicitar("ausente", "pessoa@example.test", agora)).tipo, "invalida");
    await sql.query("UPDATE portal_clients SET ativo=false WHERE id='pessoa'");
    assert.equal((await solicitar("pessoa", "pessoa@example.test", agora)).tipo, "invalida");
    assert.equal(await desafio(), undefined);
  });
  it("bloqueio após a emissão impede consumo e exclusão remove o desafio", async () => {
    const token = await emitir();
    await sql.query("UPDATE portal_clients SET ativo=false WHERE id='pessoa'");
    assert.equal((await confirmar(token, depois(1))).tipo, "invalido");
    await sql.query("DELETE FROM portal_clients WHERE id='pessoa'");
    assert.equal(await desafio(), undefined);
  });
  it("conta já confirmada não emite novo link", async () => {
    await sql.query("UPDATE portal_clients SET email_verificado=true WHERE id='pessoa'");
    assert.equal((await solicitar("pessoa", "pessoa@example.test", agora)).tipo, "confirmada");
    assert.equal(await desafio(), undefined);
  });
  it("falha na atualização desfaz consumo e permite repetir após recuperação", async () => {
    const token = await emitir();
    await sql.query("ALTER TABLE portal_clients ADD CONSTRAINT teste_nao_confirma CHECK (NOT email_verificado)");
    try { await assert.rejects(confirmar(token, depois(1))); assert.equal((await desafio()).usado_em, null); }
    finally { await sql.query("ALTER TABLE portal_clients DROP CONSTRAINT teste_nao_confirma"); }
    assert.equal((await confirmar(token, depois(2))).tipo, "confirmado");
  });
  it("tokens ausentes, malformados e desconhecidos não alteram estado", async () => {
    for (const token of ["", "../segredo", "a".repeat(63), "b".repeat(65), "c".repeat(64)]) {
      assert.equal((await confirmar(token, agora)).tipo, "invalido");
    }
    assert.equal((await conta()).email_verificado, false);
  });
});
