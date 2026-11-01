import assert from "node:assert/strict";
import test from "node:test";
import { resumoThreads, type LinhaThreads } from "@/lib/conexaoThreads";

const agora = new Date("2026-11-01T00:00:00Z");
const linha: LinhaThreads = { account_name: "empresa", status: "ACTIVE", scopes: ["threads_basic", "threads_content_publish"],
  token_expires_at: new Date("2026-12-01T00:00:00Z"), last_synced_at: agora };

test("Threads só apresenta capacidades concedidas enquanto a autorização está ativa", () => {
  assert.equal(resumoThreads(linha, agora)?.publicar, true);
  assert.equal(resumoThreads(linha, agora)?.resultados, false);
  for (const alteracao of [{ status: "REVOKED" }, { token_expires_at: agora }, { token_expires_at: null }]) {
    const estado = resumoThreads({ ...linha, ...alteracao }, agora);
    assert.equal(estado?.conectada, false);
    assert.equal(estado?.publicar, false);
  }
});
test("sem conexão ou escopos válidos não inventa acesso nem repassa dados extras", () => {
  assert.equal(resumoThreads(undefined, agora), null);
  assert.equal(resumoThreads({ ...linha, scopes: { threads_content_publish: true } }, agora)?.publicar, false);
  const entrada = { ...linha, token_ciphertext: "never-return" };
  assert.equal(JSON.stringify(resumoThreads(entrada, agora)).includes("never-return"), false);
});
