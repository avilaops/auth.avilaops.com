import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

const conexao = process.env.TEST_AUTH_DATABASE_URL;
describe("conexões próprias da conta no PostgreSQL", { skip: !conexao }, async () => {
  const schema = `conexoes_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(conexao ?? "postgresql://127.0.0.1/unused"); url.searchParams.set("schema", schema);
  const prisma = new PrismaClient({ datasourceUrl: url.href }); Object.assign(globalThis, { prisma });
  const { conexoesDaConta, revogarConexaoDaConta } = await import("@/lib/conexoesDaConta");
  const sql = new pg.Client({ connectionString: conexao });
  let criou = false; let propria = "", alheia = "", orgA = "", orgB = "";
  before(async () => {
    await sql.connect(); await sql.query(`CREATE SCHEMA ${schema}`); criou = true;
    await sql.query(`SET search_path TO ${schema}`);
    const raiz = new URL("../prisma/migrations/", import.meta.url);
    for (const nome of (await readdir(raiz)).filter((n) => /^\d/.test(n)).sort()) await sql.query((await readFile(new URL(`${nome}/migration.sql`, raiz), "utf8")).replace('CREATE SCHEMA IF NOT EXISTS "public";', `CREATE SCHEMA IF NOT EXISTS "${schema}";`));
    await prisma.aplicacao.create({ data: { id: "mcp-conta", host: "example.test", nome: "Sistema conectado" } });
    await prisma.clienteOidc.create({ data: { id: "cliente", appId: "mcp-conta", nome: "Conector de trabalho", redirectUris: "", segredoHash: "sintetico" } });
    for (const pessoa of ["a", "b"]) {
      const org = await prisma.organizacaoCorporativa.create({ data: { clienteId: "cliente", referenciaExterna: pessoa, nome: `Empresa ${pessoa}`, vinculos: { create: { contaId: pessoa } } } });
      const c = await prisma.mcpConexao.create({ data: { clienteId: "cliente", sub: pessoa, organizacaoId: org.id, pedidoHash: "sintetico", operacoes: ["read", "write"], usadoEm: new Date() } });
      await prisma.refreshOAuth.create({ data: { tokenHash: `hash-${pessoa}`, familia: `familia-${pessoa}`, clienteId: "cliente", sub: pessoa, email: `${pessoa}@example.test`, expiraEm: new Date(Date.now() + 600_000), mcpConexaoId: c.id } });
      if (pessoa === "a") { propria = c.id; orgA = org.id; } else { alheia = c.id; orgB = org.id; }
    }
  });
  after(async () => { await prisma.$disconnect(); try { if (criou) await sql.query(`DROP SCHEMA ${schema} CASCADE`); } finally { await sql.end(); } });
  it("lista somente conexões próprias com nomes reais e sem segredos", async () => {
    const lista = await conexoesDaConta("a");
    assert.equal(lista.conexoes.length, 1); const c = lista.conexoes[0];
    assert.equal(c.id, propria); assert.equal(c.nome, "Conector de trabalho"); assert.equal(c.empresa, "Empresa a");
    assert.equal(c.sistema, "Sistema conectado"); assert.deepEqual(c.operacoes, ["read", "write"]);
    assert.equal("tokens" in c, false); assert.equal("tokenHash" in c, false);
  });
  it("conexão com empresa sem vínculo não revela nome de outra empresa", async () => {
    await prisma.mcpConexao.create({ data: { clienteId: "cliente", sub: "a", organizacaoId: orgB, pedidoHash: "sintetico", operacoes: ["read"], usadoEm: new Date() } });
    const lista = await conexoesDaConta("a");
    assert.ok(lista.conexoes.some((c) => c.empresa === "Empresa indisponível"));
    assert.ok(lista.conexoes.every((c) => c.empresa !== "Empresa b"));
  });
  it("revogação cruzada não altera conexão, refresh ou auditoria", async () => {
    assert.equal(await revogarConexaoDaConta("a", "a@example.test", alheia), false);
    assert.equal((await prisma.mcpConexao.findUniqueOrThrow({ where: { id: alheia } })).revogadoEm, null);
    assert.equal((await prisma.refreshOAuth.findUniqueOrThrow({ where: { tokenHash: "hash-b" } })).revogadoEm, null);
    assert.equal(await prisma.evento.count({ where: { tipo: "mcp_conexao_revogada" } }), 0);
  });
  it("revoga conexão e família própria com auditoria, preservando outra conta", async () => {
    assert.equal(await revogarConexaoDaConta("a", "a@example.test", propria), true);
    assert.ok((await prisma.mcpConexao.findUniqueOrThrow({ where: { id: propria } })).revogadoEm);
    assert.ok((await prisma.refreshOAuth.findUniqueOrThrow({ where: { tokenHash: "hash-a" } })).revogadoEm);
    assert.equal((await prisma.mcpConexao.findUniqueOrThrow({ where: { id: alheia } })).revogadoEm, null);
    assert.ok(!(await conexoesDaConta("a")).conexoes.some((c) => c.id === propria));
    assert.equal(await revogarConexaoDaConta("a", "a@example.test", propria), false);
    assert.equal(await prisma.evento.count({ where: { tipo: "mcp_conexao_revogada" } }), 1);
  });
  it("pagina sem duplicar e não lista consentimento ainda não consumido", async () => {
    for (let i = 0; i < 51; i++) await prisma.mcpConexao.create({ data: { clienteId: "cliente", sub: "muitas", organizacaoId: orgA, pedidoHash: "sintetico", operacoes: ["read"], usadoEm: new Date() } });
    await prisma.mcpConexao.create({ data: { clienteId: "cliente", sub: "muitas", organizacaoId: orgA, pedidoHash: "pendente", operacoes: ["read"] } });
    const a = await conexoesDaConta("muitas"), b = await conexoesDaConta("muitas", 2);
    assert.equal(a.conexoes.length, 50); assert.equal(a.temMais, true); assert.equal(b.conexoes.length, 1); assert.equal(b.temMais, false);
    assert.equal(new Set([...a.conexoes, ...b.conexoes].map((c) => c.id)).size, 51);
  });
});
