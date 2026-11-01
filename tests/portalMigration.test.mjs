import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import pg from "pg";

const execute = promisify(execFile);
const script = new URL("../scripts/migrate-portal.mjs", import.meta.url);
const migrate = (url) => execute(process.execPath, [fileURLToPath(script)], {
  env: { ...process.env, PORTAL_DATABASE_URL: url }, timeout: 45000,
});

test("migração exige a conexão do portal sem usar DATABASE_URL", async () => {
  await assert.rejects(migrate(""), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /PORTAL_DATABASE_URL não configurada/);
    return true;
  });
});

test("CLI migra antes do servidor, preserva estados e recusa banco sem tabela", {
  skip: !process.env.TEST_PORTAL_DATABASE_URL,
}, async () => {
  const schema = `migration_${randomUUID().replaceAll("-", "")}`;
  const client = new pg.Client({ connectionString: process.env.TEST_PORTAL_DATABASE_URL });
  const url = new URL(process.env.TEST_PORTAL_DATABASE_URL);
  url.searchParams.set("options", `-c search_path=${schema}`);
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await assert.rejects(migrate(url.href), (error) => {
      assert.equal(error.code, 1);
      assert.equal(error.stderr.trim(), "Migração do portal falhou; inicialização interrompida.");
      return true;
    });
    await client.query("CREATE TABLE portal_clients (id text PRIMARY KEY)");
    await client.query("INSERT INTO portal_clients VALUES ('legado')");
    await migrate(url.href);
    assert.deepEqual((await client.query("SELECT * FROM portal_clients")).rows, [{
      id: "legado", email_verificado: false, mfa_email_ativo: false, mfa_email_bloqueado_ate: null,
    }]);
    await client.query("UPDATE portal_clients SET email_verificado=true, mfa_email_ativo=true, mfa_email_bloqueado_ate='2026-11-01T12:00:00Z'");
    await Promise.all([migrate(url.href), migrate(url.href)]);
    const row = (await client.query("SELECT * FROM portal_clients")).rows[0];
    assert.equal(row.email_verificado, true);
    assert.equal(row.mfa_email_ativo, true);
    assert.equal(row.mfa_email_bloqueado_ate.toISOString(), "2026-11-01T12:00:00.000Z");
  } finally {
    await client.query(`DROP SCHEMA ${schema} CASCADE`);
    await client.end();
  }
});
