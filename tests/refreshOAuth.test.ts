import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { documentoDescoberta } from "@/lib/oidc";
import { identidadeParaRenovar, VALIDADE_REFRESH_MS } from "@/lib/refreshOAuth";

const conta = { id: "c1", email: "ana@exemplo.com", nome: "Ana", role: "CLIENT" as const, ativa: true };

describe("refresh token do OIDC", () => {
  it("renova com a identidade de agora, e o papel sai da conta", () => {
    assert.deepEqual(identidadeParaRenovar(conta), { sub: "c1", email: "ana@exemplo.com", nome: "Ana", foto: null, papel: "CLIENTE" });
    assert.equal(identidadeParaRenovar({ ...conta, role: "OWNER" })?.papel, "ADMIN");
    // Dono do negócio é cliente, não equipe: o refresh não pode promovê-lo.
    assert.equal(identidadeParaRenovar({ ...conta, role: "ADMIN" })?.papel, "CLIENTE");
  });

  it("conta desligada ou removida não renova", () => {
    assert.equal(identidadeParaRenovar({ ...conta, ativa: false }), null);
    assert.equal(identidadeParaRenovar(null), null);
  });

  it("vale 30 dias sem uso e a descoberta anuncia a concessão", () => {
    assert.equal(VALIDADE_REFRESH_MS, 30 * 24 * 60 * 60 * 1000);
    assert.deepEqual(documentoDescoberta(true).grant_types_supported, ["authorization_code", "refresh_token"]);
  });
});
