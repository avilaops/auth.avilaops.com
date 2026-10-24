import assert from "node:assert/strict";
import { it } from "node:test";
import { configuracaoPoolPortal } from "@/lib/poolPortalConfig";

it("preserva três conexões por padrão e limita espera pelo pool", () => {
  assert.deepEqual(configuracaoPoolPortal({}), { max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
});

it("dimensiona cada réplica sem mudar código", () => {
  assert.deepEqual(configuracaoPoolPortal({ PORTAL_DB_POOL_MAX: "12", PORTAL_DB_CONNECTION_TIMEOUT_MS: "5000", PORTAL_DB_IDLE_TIMEOUT_MS: "20000" }),
    { max: 12, connectionTimeoutMillis: 5000, idleTimeoutMillis: 20000 });
});

it("recusa configuração inválida sem expor a URL de conexão", () => {
  for (const valor of ["0", "-1", "NaN", "1.5", "101"]) {
    assert.throws(() => configuracaoPoolPortal({ PORTAL_DB_POOL_MAX: valor }), /PORTAL_DB_POOL_MAX/);
  }
  assert.throws(() => configuracaoPoolPortal({ PORTAL_DB_CONNECTION_TIMEOUT_MS: "0" }), /PORTAL_DB_CONNECTION_TIMEOUT_MS/);
});
