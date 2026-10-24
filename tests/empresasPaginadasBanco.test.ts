import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

const url = process.env.TEST_PORTAL_DATABASE_URL;
describe("seletor PostgreSQL com 300 mil empresas sintéticas", { skip: !url }, async () => {
  process.env.PORTAL_DATABASE_URL = url;
  process.env.PORTAL_DB_POOL_MAX = "1";
  const { poolPortal } = await import("@/lib/contas");
  const { consultarEmpresas, empresasPorIds } = await import("@/lib/empresas");
  const pool = poolPortal();
  let criouSchema = false;
  let criouTabela = false;

  before(async () => {
    // Esta fixture cria uma tabela qualificada. Só roda no banco descartável do job.
    assert.equal(new URL(url!).pathname, "/auth_pagination_test", "Use o banco isolado auth_pagination_test");
    await pool.query("CREATE SCHEMA operations");
    criouSchema = true;
    await pool.query("CREATE TABLE operations.organizations (id uuid PRIMARY KEY, name text NOT NULL, status text)");
    criouTabela = true;
    await pool.query(`INSERT INTO operations.organizations
      SELECT md5(i::text)::uuid, 'Empresa ' || lpad(i::text, 6, '0'), 'active'
      FROM generate_series(1, 300000) AS i`);
    await pool.query("ANALYZE operations.organizations");
  });
  after(async () => {
    try {
      if (criouTabela) await pool.query("DROP TABLE operations.organizations");
      if (criouSchema) await pool.query("DROP SCHEMA operations");
    } finally { await pool.end(); }
  });

  it("devolve somente 25 opções, com sentinela e sem repetir páginas adjacentes", async () => {
    const a = await consultarEmpresas();
    const b = await consultarEmpresas("", 2);
    assert.equal(a.disponivel, true);
    assert.equal(a.opcoes.length, 25);
    assert.equal(a.temMais, true);
    assert.equal(new Set([...a.opcoes, ...b.opcoes].map((o) => o.valor)).size, 50);
    assert.equal(a.opcoes[0].rotulo, "Empresa 000001");
    assert.equal(b.opcoes[0].rotulo, "Empresa 000026");
  });

  it("encontra a última página sem acumular o cadastro no processo", async () => {
    const ultima = await consultarEmpresas("", 12000);
    assert.equal(ultima.opcoes.length, 25);
    assert.equal(ultima.opcoes[24].rotulo, "Empresa 300000");
    assert.equal(ultima.temMais, false);
    assert.equal((await consultarEmpresas("", 12001)).opcoes.length, 0);
  });

  it("busca além do teto antigo e resolve só os IDs selecionados", async () => {
    const r = await consultarEmpresas("EMPRESA 300000");
    assert.equal(r.opcoes.length, 1);
    assert.equal(r.temMais, false);
    const ids = [r.opcoes[0].valor, r.opcoes[0].valor, "00000000-0000-0000-0000-000000000000"];
    const selecionadas = await empresasPorIds(ids);
    assert.equal(selecionadas.length, 1);
    assert.equal(selecionadas[0].nome, "Empresa 300000");
    assert.deepEqual(await empresasPorIds([]), []);
  });

  it("trata curingas como literais e normaliza acentos", async () => {
    for (const busca of ["%", "_", "' OR 1=1 --"]) assert.equal((await consultarEmpresas(busca)).opcoes.length, 0);
    await pool.query("UPDATE operations.organizations SET name = $1 WHERE id = md5($2)::uuid", ["Ávila Indu\u0301stria", "300000"]);
    const r = await consultarEmpresas("AVILA industria");
    assert.equal(r.opcoes.length, 1);
  });

  it("indica cadastro indisponível e libera a conexão após erro SQL", async () => {
    await pool.query("DROP TABLE operations.organizations");
    criouTabela = false;
    assert.deepEqual(await consultarEmpresas(), { opcoes: [], pag: 1, temMais: false, disponivel: false });
    assert.deepEqual(await empresasPorIds(["00000000-0000-0000-0000-000000000000"]), []);
    assert.equal((await pool.query("SELECT 1 AS ok")).rows[0].ok, 1);
  });
});
