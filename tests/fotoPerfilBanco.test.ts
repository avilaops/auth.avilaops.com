import assert from "node:assert/strict";
import { before, after, it, describe } from "node:test";
import { poolPortal } from "@/lib/contas";
import { buscarFotoPerfil, salvarFotoPerfil } from "@/lib/fotoPerfil";

describe("foto persistida da conta", { skip: !process.env.TEST_PORTAL_DATABASE_URL }, () => {
  process.env.PORTAL_DATABASE_URL = process.env.TEST_PORTAL_DATABASE_URL;
  process.env.PORTAL_DB_POOL_MAX = "1";
  const pool = poolPortal();
  before(async () => {
    await pool.query("CREATE TEMP TABLE portal_clients (id text PRIMARY KEY, foto_perfil bytea, ativo boolean default true, atualizado_em timestamptz default now())");
    await pool.query("INSERT INTO portal_clients(id) VALUES ('a'),('b')");
  });
  after(async () => { await pool.end(); });
  it("altera somente a conta indicada e permite remover a foto", async () => {
    assert.equal(await salvarFotoPerfil("a", Buffer.from([1, 2, 3])), true);
    assert.deepEqual((await buscarFotoPerfil("a"))?.bytes, Buffer.from([1, 2, 3]));
    assert.equal(await buscarFotoPerfil("b"), null);
    assert.equal(await salvarFotoPerfil("a", null), true);
    assert.equal(await buscarFotoPerfil("a"), null);
    assert.equal(await salvarFotoPerfil("inexistente", Buffer.from([4])), false);
  });
  it("não grava ou serve foto de conta inativa", async () => {
    await pool.query("UPDATE portal_clients SET ativo=false WHERE id='b'");
    assert.equal(await salvarFotoPerfil("b", Buffer.from([5])), false);
    assert.equal(await buscarFotoPerfil("b"), null);
  });
});
