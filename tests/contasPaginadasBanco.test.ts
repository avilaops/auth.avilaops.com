import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { defContas } from "@/lib/contasLista";
import { lerConsulta } from "@/lib/listagem";

// Banco exclusivo de teste. A tabela é TEMPORARY, nunca troca/apaga dados reais.
const url = process.env.TEST_PORTAL_DATABASE_URL;
describe("paginação PostgreSQL com 300 mil contas sintéticas", { skip: !url }, async () => {
  process.env.PORTAL_DATABASE_URL = url;
  process.env.PORTAL_DB_POOL_MAX = "1";
  const { poolPortal, consultarPaginaDeContas } = await import("@/lib/contas");
  const pool = poolPortal();
  const def = defContas([{ id: "empresa-a", nome: "Empresa A", situacao: null }]);
  const consultar = (params: Record<string, string> = {}, busca = "") => consultarPaginaDeContas(lerConsulta(params, def), busca);

  before(async () => {
    await pool.query(`CREATE TEMPORARY TABLE portal_clients (
      id text PRIMARY KEY, nome text NOT NULL, email text NOT NULL, cpf text, telefone text,
      role text NOT NULL, senha_provisoria boolean NOT NULL, criado_em timestamp NOT NULL,
      ativo boolean NOT NULL, organization_id text, ultimo_acesso_em timestamp
    )`);
    await pool.query(`INSERT INTO portal_clients
      SELECT lpad(i::text, 6, '0'), 'Conta ' || lpad(i::text, 6, '0'), 'pessoa' || i || '@example.invalid',
             CASE WHEN i = 300000 THEN '123.456.789-09' END,
             CASE WHEN i = 299999 THEN '+55 (11) 98765-4321' END,
             CASE WHEN i <= 2 THEN 'OWNER' WHEN i = 3 THEN 'SOCIO' WHEN i = 4 THEN 'ADMIN' WHEN i = 5 THEN 'DESCONHECIDO' ELSE 'CLIENT' END,
             i % 2 = 0, timestamp '2026-01-01' + i * interval '1 second',
             i % 3 <> 0, CASE WHEN i % 2 = 0 THEN 'empresa-a' END, NULL
      FROM generate_series(1, 300000) AS i`);
    await pool.query("ANALYZE portal_clients");
  });
  after(async () => { await pool.end(); });

  it("conta a base inteira e devolve só a página, inclusive após o antigo teto", async () => {
    const r = await consultar({ pag: "201" });
    assert.equal(r.total, 300_000);
    assert.equal(r.equipe, 3);
    assert.equal(r.comEmpresa, 150_000);
    assert.equal(r.pagina.total, 300_000);
    assert.equal(r.pagina.itens.length, 25);
    assert.equal(r.pagina.itens[0].id, "005001");
    assert.deepEqual([r.pagina.de, r.pagina.ate], [5001, 5025]);
    assert.equal("senha_hash" in r.pagina.itens[0], false);
  });

  it("limita página além do fim, conserva desempate e não duplica páginas adjacentes", async () => {
    const fim = await consultar({ pag: "100000", por: "100" });
    assert.deepEqual([fim.pagina.pag, fim.pagina.paginas, fim.pagina.de, fim.pagina.ate], [3000, 3000, 299901, 300000]);
    const a = await consultar({ pag: "1", ord: "estado" });
    const b = await consultar({ pag: "2", ord: "estado" });
    assert.equal(new Set([...a.pagina.itens, ...b.pagina.itens].map((c) => c.id)).size, 50);
    const reversa = await consultar({ ord: "criada", dir: "desc" });
    assert.equal(reversa.pagina.itens[0].id, "300000");
  });

  it("aplica todos os filtros antes de contar e paginar", async () => {
    const r = await consultar({ f_tipo: "cliente", f_estado: "ativa", f_empresa: "empresa-a", f_senha: "provisoria" });
    assert.equal(r.pagina.total, 99_999);
    assert.equal(r.pagina.itens[0].id, "000004");
    assert.ok(r.pagina.itens.every((c) => c.ativa && c.senhaProvisoria && c.organizationId === "empresa-a"));
    const desconhecido = await consultar({ f_papel: "CLIENT" }, "pessoa5@example.invalid");
    assert.equal(desconhecido.pagina.itens[0].role, "CLIENT");
    const sem = await consultar({ f_empresa: "sem" });
    assert.equal(sem.pagina.total, 150_000);
  });

  it("busca por CPF e telefone encontra contas fora das primeiras 5 mil", async () => {
    assert.equal((await consultar({}, "12345678909")).pagina.itens[0].id, "300000");
    assert.equal((await consultar({}, "11987654321")).pagina.itens[0].id, "299999");
  });

  it("não interpreta busca como SQL/coringa e trata vazio corretamente", async () => {
    for (const busca of ["%", "_", "' OR 1=1 --", "inexistente"]) {
      const r = await consultar({}, busca);
      assert.deepEqual([r.pagina.total, r.pagina.de, r.pagina.ate, r.pagina.paginas], [0, 0, 0, 1]);
    }
    const r = await consultar({}, "CONTA 300000 pessoa300000");
    assert.equal(r.pagina.total, 1);
  });

  it("normaliza acento e unicode decomposto na busca do PostgreSQL", async () => {
    await pool.query("UPDATE portal_clients SET nome = $1 WHERE id = '300000'", ["João A\u0301vila"]);
    const r = await consultar({}, "JOAO avila");
    assert.equal(r.pagina.itens[0].id, "300000");
  });
});
