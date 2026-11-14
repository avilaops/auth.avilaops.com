import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import { lerCadastro } from "@/lib/apps";

const conexao = process.env.TEST_AUTH_DATABASE_URL;
describe("vínculos apresentados na conta com PostgreSQL", { skip: !conexao }, async () => {
  const schema = `conta_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(conexao!);
  url.searchParams.set("schema", schema);
  const prisma = new PrismaClient({ datasourceUrl: url.href });
  Object.assign(globalThis, { prisma });
  const { acessosDaConta } = await import("@/lib/acessosDaConta");
  const sql = new pg.Client({ connectionString: conexao });
  let criou = false;
  let cadastro: ReturnType<typeof lerCadastro>[];
  const criar = async (nome: string, contaId: string, situacao = "ATIVO") => prisma.organizacaoCorporativa.create({ data: {
    clienteId: "cliente", referenciaExterna: nome, nome,
    vinculos: { create: { contaId, situacao, autorizacoes: { create: { papel: "COMPRADOR" } } } },
  } });
  before(async () => {
    await sql.connect();
    await sql.query(`CREATE SCHEMA ${schema}`); criou = true;
    await sql.query(`SET search_path TO ${schema}`);
    const raiz = new URL("../prisma/migrations/", import.meta.url);
    for (const nome of (await readdir(raiz)).filter((n) => /^\d/.test(n)).sort()) {
      const ddl = (await readFile(new URL(`${nome}/migration.sql`, raiz), "utf8"))
        .replace('CREATE SCHEMA IF NOT EXISTS "public";', `CREATE SCHEMA IF NOT EXISTS "${schema}";`);
      await sql.query(ddl);
    }
    const app = await prisma.aplicacao.create({ data: { id: "conta-app", host: "example.test", nome: "Sistema", situacao: "no_ar" } });
    cadastro = [lerCadastro(app)];
    await prisma.clienteOidc.create({ data: { id: "cliente", appId: app.id, nome: "Cliente", redirectUris: "", segredoHash: "sintetico" } });
  });
  after(async () => {
    await prisma.$disconnect();
    try { if (criou) await sql.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await sql.end(); }
  });
  it("consulta somente o identificador autenticado, sem vínculo por coincidência de e-mail", async () => {
    await criar("Empresa própria", "pessoa");
    await criar("Outra empresa", "outra-pessoa");
    const resultado = await acessosDaConta("pessoa", cadastro, ["conta-app"]);
    assert.equal(resultado.vinculos.length, 1);
    assert.equal(resultado.vinculos[0].empresa, "Empresa própria");
    assert.equal(resultado.vinculos[0].acessoAoSistema, true);
    assert.deepEqual(await acessosDaConta("sem-vinculo", cadastro, ["conta-app"]), { vinculos: [], temMais: false });
  });
  it("distingue suspensão, remoção, ausência de autorização e aplicação sem acesso", async () => {
    await criar("Suspensa", "bloqueada", "SUSPENSO");
    await criar("Removida", "bloqueada", "REVOGADO");
    const semPapel = await criar("Sem papel", "bloqueada");
    await prisma.autorizacaoCorporativa.deleteMany({ where: { vinculo: { organizacaoId: semPapel.id } } });
    const resultado = await acessosDaConta("bloqueada", cadastro, []);
    assert.deepEqual(new Set(resultado.vinculos.map((v) => v.situacao)), new Set(["SUSPENSO", "REVOGADO", "SEM_AUTORIZACAO"]));
    assert.ok(resultado.vinculos.every((v) => !v.acessoAoSistema && !v.papeis.length));
  });
  it("não apresenta papel de unidade suspensa ou pertencente a outra empresa", async () => {
    const org = await criar("Por unidade", "unidade");
    const outra = await criar("Outra unidade", "terceiro");
    const vinculo = await prisma.vinculoCorporativo.findFirstOrThrow({ where: { contaId: "unidade" } });
    await prisma.autorizacaoCorporativa.deleteMany({ where: { vinculoId: vinculo.id } });
    for (const [organizacaoId, situacao] of [[org.id, "SUSPENSO"], [outra.id, "ATIVO"]]) {
      const unidade = await prisma.unidadeCorporativa.create({ data: { organizacaoId, situacao, referenciaExterna: "u", nome: "Unidade" } });
      await prisma.autorizacaoCorporativa.create({ data: { vinculoId: vinculo.id, unidadeId: unidade.id, papel: "COMPRADOR" } });
    }
    const resultado = await acessosDaConta("unidade", cadastro, ["conta-app"]);
    assert.equal(resultado.vinculos[0].situacao, "SEM_AUTORIZACAO");
    assert.deepEqual(resultado.vinculos[0].papeis, []);
  });
  it("limita a consulta e informa a existência de outros vínculos", async () => {
    for (let i = 0; i < 51; i++) await criar(`Empresa ${i}`, "muitas");
    const resultado = await acessosDaConta("muitas", cadastro, ["conta-app"]);
    assert.equal(resultado.vinculos.length, 50);
    assert.equal(resultado.temMais, true);
    const proxima = await acessosDaConta("muitas", cadastro, ["conta-app"], 2);
    assert.equal(proxima.vinculos.length, 1);
    assert.equal(proxima.temMais, false);
    assert.equal(new Set([...resultado.vinculos, ...proxima.vinculos].map((v) => v.id)).size, 51);
  });
  it("propaga falha de banco em vez de apresentar conta sem empresas", async () => {
    await sql.query("ALTER TABLE vinculos_corporativos RENAME TO vinculos_indisponiveis");
    try { await assert.rejects(acessosDaConta("pessoa", cadastro, ["conta-app"])); }
    finally { await sql.query("ALTER TABLE vinculos_indisponiveis RENAME TO vinculos_corporativos"); }
  });
});
