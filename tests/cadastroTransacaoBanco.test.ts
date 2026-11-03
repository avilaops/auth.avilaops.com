import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import type { Cadastro } from "@/lib/apps";

// Sem fallback para DATABASE_URL: só conexão de teste explícita e schema próprio.
const conexao = process.env.TEST_CADASTRO_DATABASE_URL;
describe("gravação do catálogo no PostgreSQL", { skip: !conexao && "TEST_CADASTRO_DATABASE_URL não definida" }, async () => {
  const schema = `avl420_catalogo_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(conexao ?? "postgresql://127.0.0.1/teste");
  url.searchParams.set("schema", schema);
  const prisma = new PrismaClient({ datasourceUrl: url.href });
  const sql = new pg.Client({ connectionString: conexao, connectionTimeoutMillis: 3000 });
  Object.assign(globalThis, { prisma });
  const { criarCadastro, atualizarCadastro, buscarCadastro } = await import("@/lib/cadastro");
  let schemaCriado = false;
  let publicExistia: boolean | null = null;

  const dados = (id: string): Cadastro => ({
    id, nome: "Antes", host: `${id}.example.test`, tipo: "app", login: true,
    papelExigido: null, restrito: true, exigeSegundoFator: true,
    dicaDominioGoogle: null, deepLink: null, repositorio: null, servidor: null,
    publicacao: null, situacao: "no_ar", observacao: null,
    politica: { modoAcesso: "clientes_liberados", exigeMfa: true, permiteCadastro: false,
      permiteRecuperacao: false, conviteObrigatorio: true, empresaObrigatoria: true },
  });
  const estado = async (id: string) => ({
    app: (await sql.query("SELECT * FROM aplicacoes WHERE id=$1", [id])).rows,
    politica: (await sql.query("SELECT * FROM politicas_aplicacao WHERE aplicacao_id=$1", [id])).rows,
  });
  before(async () => {
    await sql.connect();
    publicExistia = (await sql.query("SELECT to_regnamespace('public') IS NOT NULL AS existe")).rows[0].existe;
    await sql.query(`CREATE SCHEMA ${schema}`);
    schemaCriado = true;
    await sql.query(`SET search_path TO ${schema}`);
    await sql.query("SET statement_timeout=10000");
    const raiz = new URL("../prisma/migrations/", import.meta.url);
    for (const nome of (await readdir(raiz)).filter(nome => /^\d/.test(nome)).sort()) {
      let ddl = await readFile(new URL(`${nome}/migration.sql`, raiz), "utf8");
      // A migration inicial cria public explicitamente. O runner de teste
      // redireciona só essa criação; nenhuma migration de produção é editada.
      if (nome === "20260814000000_init") {
        ddl = ddl.replace('CREATE SCHEMA IF NOT EXISTS "public";', `CREATE SCHEMA IF NOT EXISTS "${schema}";`);
      }
      await sql.query(ddl);
    }
  });
  after(async () => {
    try {
      await prisma.$disconnect();
      if (schemaCriado) await sql.query(`DROP SCHEMA ${schema} CASCADE`);
      if (publicExistia !== null) {
        assert.equal((await sql.query("SELECT to_regnamespace('public') IS NOT NULL AS existe")).rows[0].existe, publicExistia);
      }
    } finally { await sql.end(); }
  });

  it("persiste catálogo e opções centrais e permite leitura real pelo domínio", async () => {
    await criarCadastro(dados("criado"), "ADMIN@EXAMPLE.TEST");
    const cadastro = await buscarCadastro("criado");
    assert.equal(cadastro?.nome, "Antes");
    assert.deepEqual(cadastro?.politica, {
      modoAcesso: "clientes_liberados", exigeMfa: true, permiteCadastro: false,
      permiteRecuperacao: false, conviteObrigatorio: true, empresaObrigatoria: true,
    });
    const salvo = await estado("criado");
    assert.equal(salvo.app[0].atualizado_por, "admin@example.test");
    assert.equal(salvo.politica[0].atualizado_por, "admin@example.test");
  });
  it("atualiza as duas entidades e preserva outra aplicação", async () => {
    await criarCadastro(dados("editado"), "admin@example.test");
    await criarCadastro(dados("outra"), "admin@example.test");
    const antes = await estado("outra");
    const novo = dados("outra");
    await atualizarCadastro("editado", { ...novo, nome: "Depois", host: "depois.example.test",
      politica: { ...novo.politica!, modoAcesso: "equipe" } }, "OUTRO@EXAMPLE.TEST");
    assert.equal((await buscarCadastro("editado"))?.politica?.modoAcesso, "equipe");
    assert.equal((await estado("editado")).app[0].nome, "Depois");
    assert.deepEqual(await estado("outra"), antes);
  });
  it("reverte criação do catálogo quando uma constraint recusa a política", async () => {
    await sql.query("ALTER TABLE politicas_aplicacao ADD CONSTRAINT avl420_falha_criar CHECK (aplicacao_id <> 'falha-criar')");
    try {
      await assert.rejects(criarCadastro(dados("falha-criar"), "admin@example.test"), /avl420_falha_criar/);
      assert.deepEqual(await estado("falha-criar"), { app: [], politica: [] });
    } finally { await sql.query("ALTER TABLE politicas_aplicacao DROP CONSTRAINT avl420_falha_criar"); }
  });
  it("reverte edição do catálogo e mantém política anterior quando o upsert falha", async () => {
    const anterior = dados("falha-editar");
    await criarCadastro(anterior, "admin@example.test");
    const antes = await estado("falha-editar");
    await sql.query("ALTER TABLE politicas_aplicacao ADD CONSTRAINT avl420_falha_editar CHECK (aplicacao_id <> 'falha-editar' OR modo_acesso <> 'equipe')");
    try {
      await assert.rejects(atualizarCadastro("falha-editar", { ...anterior, nome: "Não deve persistir",
        politica: { ...anterior.politica!, modoAcesso: "equipe" } }, "outro@example.test"), /avl420_falha_editar/);
      assert.deepEqual(await estado("falha-editar"), antes);
    } finally { await sql.query("ALTER TABLE politicas_aplicacao DROP CONSTRAINT avl420_falha_editar"); }
  });
  it("tabela de política ausente impede a criação sem deixar aplicação parcial", async () => {
    await sql.query("ALTER TABLE politicas_aplicacao RENAME TO politicas_temporariamente_ausentes");
    try {
      await assert.rejects(criarCadastro(dados("sem-tabela"), "admin@example.test"), { code: "P2021" });
      assert.equal((await sql.query("SELECT count(*)::int AS total FROM aplicacoes WHERE id='sem-tabela'")).rows[0].total, 0);
    } finally { await sql.query("ALTER TABLE politicas_temporariamente_ausentes RENAME TO politicas_aplicacao"); }
  });
  it("coluna de política ausente impede a edição sem alterar nenhuma linha", async () => {
    const anterior = dados("sem-coluna");
    await criarCadastro(anterior, "admin@example.test");
    const antes = await estado("sem-coluna");
    await sql.query("ALTER TABLE politicas_aplicacao RENAME COLUMN permite_recuperacao TO recuperacao_temporariamente_ausente");
    try {
      await assert.rejects(atualizarCadastro("sem-coluna", { ...anterior, nome: "Não deve persistir" }, "outro@example.test"), { code: "P2022" });
    } finally { await sql.query("ALTER TABLE politicas_aplicacao RENAME COLUMN recuperacao_temporariamente_ausente TO permite_recuperacao"); }
    assert.deepEqual(await estado("sem-coluna"), antes);
  });
});
