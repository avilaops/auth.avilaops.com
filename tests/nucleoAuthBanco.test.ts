import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";
import { PrismaClient } from "@prisma/client";

const executar = promisify(execFile);
const conexao = process.env.TEST_AUTH_DATABASE_URL;
const raizMigracoes = new URL("../prisma/migrations/", import.meta.url);
const inicioNucleo = "20261102190000_nucleo_aplicacoes_oidc";
const integridadeAmbiente = "20261103060000_cliente_oidc_ambiente_aplicacao";

// Somente dados sintéticos em schema exclusivo. Nunca usa DATABASE_URL como fallback.
describe("contrato central no PostgreSQL", { skip: !conexao && "TEST_AUTH_DATABASE_URL não definida" }, () => {
  const schema = `avl421_${randomUUID().replaceAll("-", "")}`;
  const cliente = new pg.Client({ connectionString: conexao });
  const url = new URL(conexao ?? "postgresql://localhost/teste");
  url.searchParams.delete("schema");
  url.searchParams.set("options", `-c search_path=${schema}`);
  const preflight = (connectionString = url.href) => executar(process.execPath, [fileURLToPath(new URL("../scripts/preflight-aplicacoes.mjs", import.meta.url))], {
    env: { ...process.env, DATABASE_URL: connectionString }, timeout: 15000,
  });
  let migracoes: string[];
  const migrar = async (nome: string) => cliente.query(await readFile(new URL(`${nome}/migration.sql`, raizMigracoes), "utf8"));

  before(async () => {
    await cliente.connect();
    await cliente.query(`CREATE SCHEMA ${schema}`);
    await cliente.query(`SET search_path TO ${schema}`);
    migracoes = (await readdir(raizMigracoes)).filter(nome => /^\d/.test(nome)).sort();
    for (const nome of migracoes.filter(nome => nome < inicioNucleo)) await migrar(nome);
    await cliente.query(`INSERT INTO aplicacoes (id, host, nome, login, restrito, situacao, exige_segundo_fator)
      VALUES ('teste-a', 'a.example.test', 'A', true, true, 'no_ar', true),
             ('teste-b', 'b.example.test', 'B', true, false, 'no_ar', false)`);
    await cliente.query(`INSERT INTO clientes_oidc (id, app_id, nome, redirect_uris, segredo_hash)
      VALUES ('cliente-a', 'teste-a', 'Cliente A', $1, 'hash-sintetico'),
             ('cliente-api', 'teste-a', 'API sem redirect', '', 'hash-api')`,
    ["https://a.example.test/callback\r\nhttps://a.example.test/callback\nhttps://a.example.test/outro"]);
    assert.match((await preflight()).stdout, /nenhuma referência OIDC órfã/);
    for (const nome of migracoes.filter(nome => nome >= inicioNucleo)) await migrar(nome);
  });

  after(async () => {
    try {
      await cliente.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } finally {
      await cliente.end();
    }
  });

  it("preserva clientes, segredo e destinos legados, com backfill do ambiente", async () => {
    const { rows } = await cliente.query(`SELECT c.id, c.app_id, c.segredo_hash, c.redirect_uris,
      a.aplicacao_id, a.tipo FROM clientes_oidc c JOIN ambientes_aplicacao a ON a.id=c.ambiente_id
      WHERE c.id='cliente-a'`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].app_id, "teste-a");
    assert.equal(rows[0].aplicacao_id, "teste-a");
    assert.equal(rows[0].tipo, "producao");
    assert.equal(rows[0].segredo_hash, "hash-sintetico");
    assert.equal(rows[0].redirect_uris, "https://a.example.test/callback\r\nhttps://a.example.test/callback\nhttps://a.example.test/outro");
    const destinos = await cliente.query("SELECT uri, tipo, ativo FROM redirect_uris WHERE cliente_id='cliente-a' ORDER BY uri");
    assert.deepEqual(destinos.rows, [
      { uri: "https://a.example.test/callback", tipo: "authorization", ativo: true },
      { uri: "https://a.example.test/outro", tipo: "authorization", ativo: true },
    ]);
    assert.equal((await cliente.query("SELECT count(*)::int AS total FROM redirect_uris WHERE cliente_id='cliente-api'")).rows[0].total, 0);
  });

  it("preserva restrição e MFA ao separar a política do catálogo", async () => {
    const { rows } = await cliente.query(`SELECT aplicacao_id, modo_acesso, exige_mfa
      FROM politicas_aplicacao WHERE aplicacao_id IN ('teste-a', 'teste-b') ORDER BY aplicacao_id`);
    assert.deepEqual(rows, [
      { aplicacao_id: "teste-a", modo_acesso: "clientes_liberados", exige_mfa: true },
      { aplicacao_id: "teste-b", modo_acesso: "qualquer_conta", exige_mfa: false },
    ]);
  });

  it("persiste e consulta relações corporativas UUID pelo Prisma no esquema migrado", async () => {
    const urlPrisma = new URL(url.href);
    urlPrisma.searchParams.delete("options");
    urlPrisma.searchParams.set("schema", schema);
    const prisma = new PrismaClient({ datasources: { db: { url: urlPrisma.href } } });
    try {
      const resultado = await prisma.$transaction(async (tx) => {
        const organizacao = await tx.organizacaoCorporativa.create({
          data: { clienteId: "cliente-a", referenciaExterna: "org-sintetica", nome: "Organização sintética" },
        });
        const unidade = await tx.unidadeCorporativa.create({
          data: { organizacaoId: organizacao.id, referenciaExterna: "matriz", nome: "Matriz" },
        });
        const vinculo = await tx.vinculoCorporativo.create({
          data: { organizacaoId: organizacao.id, contaId: "conta-sintetica" },
        });
        const autorizacao = await tx.autorizacaoCorporativa.create({
          data: { vinculoId: vinculo.id, unidadeId: unidade.id, papel: "COMPRADOR" },
        });
        const lido = await tx.autorizacaoCorporativa.findUniqueOrThrow({
          where: { id: autorizacao.id }, include: { unidade: true, vinculo: { include: { organizacao: true } } },
        });
        assert.equal(lido.unidade?.organizacaoId, organizacao.id);
        assert.equal(lido.vinculo.organizacao.id, organizacao.id);
        assert.equal(lido.vinculo.contaId, "conta-sintetica");
        assert.equal(lido.vinculo.organizacao.clienteId, "cliente-a");
        await tx.autorizacaoCorporativa.update({ where: { id: autorizacao.id }, data: { papel: "APROVADOR" } });
        const semUnidade = await tx.autorizacaoCorporativa.create({ data: { vinculoId: vinculo.id, papel: "FINANCEIRO" } });
        assert.equal(semUnidade.unidadeId, null);
        const lista = await tx.autorizacaoCorporativa.findMany({ where: { vinculoId: vinculo.id }, orderBy: { papel: "asc" } });
        await tx.autorizacaoCorporativa.deleteMany({ where: { vinculoId: vinculo.id } });
        await tx.vinculoCorporativo.delete({ where: { id: vinculo.id } });
        await tx.unidadeCorporativa.delete({ where: { id: unidade.id } });
        await tx.organizacaoCorporativa.delete({ where: { id: organizacao.id } });
        return lista.map(linha => linha.papel);
      });
      assert.deepEqual(resultado, ["APROVADOR", "FINANCEIRO"]);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("recusa INSERT e UPDATE que cruzem aplicação e ambiente", async () => {
    const ambienteB = (await cliente.query("SELECT id FROM ambientes_aplicacao WHERE aplicacao_id='teste-b'")).rows[0].id;
    await assert.rejects(cliente.query(`INSERT INTO clientes_oidc
      (id, app_id, ambiente_id, nome, redirect_uris, segredo_hash)
      VALUES ('cruzado', 'teste-a', $1, 'Inválido', '', 'hash')`, [ambienteB]), { code: "23503" });
    await assert.rejects(cliente.query("UPDATE clientes_oidc SET ambiente_id=$1 WHERE id='cliente-a'", [ambienteB]), { code: "23503" });
    await assert.rejects(cliente.query("UPDATE clientes_oidc SET app_id='teste-b' WHERE id='cliente-a'"), { code: "23503" });
    await assert.rejects(cliente.query("UPDATE ambientes_aplicacao SET aplicacao_id='teste-b', nome='ambiente-cruzado' WHERE aplicacao_id='teste-a'"), (erro: unknown) => {
      const restricao = erro as { code: string; constraint: string };
      // PostgreSQL 16 reporta foreign_key_violation; 18 usa restrict_violation.
      assert.ok(["23503", "23001"].includes(restricao.code));
      assert.equal(restricao.constraint, "clientes_oidc_ambiente_aplicacao_fkey");
      return true;
    });
    const { rows } = await cliente.query(`SELECT c.app_id, a.aplicacao_id FROM clientes_oidc c
      JOIN ambientes_aplicacao a ON a.id=c.ambiente_id WHERE c.id='cliente-a'`);
    assert.deepEqual(rows, [{ app_id: "teste-a", aplicacao_id: "teste-a" }]);
  });

  it("aceita cliente sem ambiente na transição e vinculação ao ambiente da própria aplicação", async () => {
    await cliente.query(`INSERT INTO clientes_oidc (id, app_id, nome, redirect_uris, segredo_hash)
      VALUES ('sem-ambiente', 'teste-a', 'Legado', '', 'hash')`);
    const ambiente = (await cliente.query("SELECT id FROM ambientes_aplicacao WHERE aplicacao_id='teste-a'")).rows[0].id;
    await cliente.query("UPDATE clientes_oidc SET ambiente_id=$1 WHERE id='sem-ambiente'", [ambiente]);
    assert.equal((await cliente.query("SELECT ambiente_id FROM clientes_oidc WHERE id='sem-ambiente'")).rows[0].ambiente_id, ambiente);
  });

  it("preflight aceita dados consistentes no schema selecionado", async () => {
    assert.match((await preflight()).stdout, /nenhuma referência OIDC órfã/);
  });

  it("preflight respeita schema da URL Prisma sem consultar public", async () => {
    const urlPrisma = new URL(url.href);
    urlPrisma.searchParams.delete("options");
    urlPrisma.searchParams.set("schema", schema);
    assert.match((await preflight(urlPrisma.href)).stdout, /nenhuma referência OIDC órfã/);
    urlPrisma.searchParams.set("schema", `${schema}_ausente`);
    await assert.rejects(preflight(urlPrisma.href), (erro: unknown) => {
      const resultado = erro as { code: number; stderr: string };
      assert.equal(resultado.code, 1);
      assert.match(resultado.stderr, /tabelas ausentes: aplicacoes, clientes_oidc/);
      return true;
    });
  });

  it("migração e preflight recusam divergência preexistente sem reparar dados silenciosamente", async () => {
    // Reproduz o esquema anterior dentro de transação: rollback restaura a FK nova.
    await cliente.query("BEGIN");
    try {
      await cliente.query("ALTER TABLE clientes_oidc DROP CONSTRAINT clientes_oidc_ambiente_aplicacao_fkey");
      await cliente.query("DROP INDEX ambientes_aplicacao_id_aplicacao_id_key");
      await cliente.query(`UPDATE clientes_oidc SET ambiente_id=(SELECT id FROM ambientes_aplicacao WHERE aplicacao_id='teste-b')
        WHERE id='cliente-a'`);
      await assert.rejects(migrar(integridadeAmbiente), { code: "23503" });
    } finally {
      await cliente.query("ROLLBACK");
    }
    // O CLI usa outra conexão, portanto precisa observar uma inconsistência commitada.
    await cliente.query("ALTER TABLE clientes_oidc DROP CONSTRAINT clientes_oidc_ambiente_aplicacao_fkey");
    try {
      await cliente.query(`UPDATE clientes_oidc SET ambiente_id=(SELECT id FROM ambientes_aplicacao WHERE aplicacao_id='teste-b')
        WHERE id='cliente-a'`);
      await assert.rejects(preflight(), (erro: unknown) => {
        const resultado = erro as { code: number; stderr: string };
        assert.equal(resultado.code, 1);
        assert.match(resultado.stderr, /1 cliente\(s\) OIDC com ambiente de outra aplicação ou inexistente/);
        assert.doesNotMatch(resultado.stderr, /cliente-a|example\.test|hash-sintetico/);
        return true;
      });
      assert.equal((await cliente.query(`SELECT a.aplicacao_id FROM clientes_oidc c
        JOIN ambientes_aplicacao a ON a.id=c.ambiente_id WHERE c.id='cliente-a'`)).rows[0].aplicacao_id, "teste-b");
    } finally {
      await cliente.query(`UPDATE clientes_oidc SET ambiente_id=(SELECT id FROM ambientes_aplicacao WHERE aplicacao_id='teste-a')
        WHERE id='cliente-a'`);
      await cliente.query(`ALTER TABLE clientes_oidc ADD CONSTRAINT clientes_oidc_ambiente_aplicacao_fkey
        FOREIGN KEY (ambiente_id, app_id) REFERENCES ambientes_aplicacao (id, aplicacao_id) ON DELETE RESTRICT ON UPDATE RESTRICT`);
    }
  });
});
