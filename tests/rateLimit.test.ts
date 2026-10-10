import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { horaDeLimpar, INTERVALO_DA_LIMPEZA_MS } from "@/lib/rateLimit";

describe("limpeza das janelas vencidas do limite de tentativas", () => {
  const agora = Date.UTC(2026, 9, 10, 12, 0, 0);

  it("processo que acabou de subir limpa na primeira tentativa", () => {
    assert.equal(horaDeLimpar(agora, 0), true);
  });

  it("não limpa de novo antes de o intervalo passar", () => {
    assert.equal(horaDeLimpar(agora, agora), false);
    assert.equal(horaDeLimpar(agora, agora - INTERVALO_DA_LIMPEZA_MS + 1), false);
  });

  it("limpa quando o intervalo fecha", () => {
    assert.equal(horaDeLimpar(agora, agora - INTERVALO_DA_LIMPEZA_MS), true);
  });
});
