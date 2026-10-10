import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { descrever, divergencia, interpretar, motivoDaFalha, precisaConferir, VALIDADE_MS, vencida } from "@/lib/conferencia";

describe("conferência das aplicações", () => {
  it("qualquer resposta abaixo de 500 conta como no ar, inclusive redirecionar e negar", () => {
    for (const status of [200, 204, 301, 307, 401, 403, 404]) assert.equal(interpretar({ status }).responde, true, String(status));
  });

  it("erro do servidor e falta de resposta contam como fora do ar", () => {
    assert.deepEqual(interpretar({ status: 502 }), { responde: false, status: 502, detalhe: null });
    assert.deepEqual(interpretar({ erro: "conexão recusada" }), { responde: false, status: null, detalhe: "conexão recusada" });
  });

  it("só confere o que o cadastro diz existir", () => {
    assert.equal(precisaConferir("no_ar"), true);
    assert.equal(precisaConferir("fora_do_ar"), true);
    assert.equal(precisaConferir("planejado"), false);
    assert.equal(precisaConferir("desativado"), false);
  });

  it("refaz quando nunca conferiu ou quando a validade passou", () => {
    const agora = Date.UTC(2026, 9, 10, 12, 0, 0);
    assert.equal(vencida(null, agora), true);
    assert.equal(vencida(new Date(agora - VALIDADE_MS), agora), true);
    assert.equal(vencida(new Date(agora - VALIDADE_MS + 1), agora), false);
  });

  it("aponta quando o cadastro e a conferência discordam", () => {
    assert.equal(divergencia("no_ar", { responde: false }), "informada_no_ar_sem_resposta");
    assert.equal(divergencia("fora_do_ar", { responde: true }), "informada_fora_do_ar_respondendo");
    assert.equal(divergencia("no_ar", { responde: true }), null);
    assert.equal(divergencia("fora_do_ar", { responde: false }), null);
    assert.equal(divergencia("no_ar", null), null);
    assert.equal(divergencia("planejado", { responde: true }), null);
  });

  it("falha de rede vira palavra de tela", () => {
    assert.equal(motivoDaFalha(Object.assign(new Error("x"), { name: "TimeoutError" })), "sem resposta em 5 segundos");
    assert.equal(motivoDaFalha(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } })), "o endereço não existe no DNS");
    assert.equal(motivoDaFalha(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } })), "conexão recusada");
    assert.equal(motivoDaFalha(Object.assign(new TypeError("fetch failed"), { cause: { code: "CERT_HAS_EXPIRED" } })), "certificado inválido");
    assert.equal(motivoDaFalha(new TypeError("fetch failed")), "falha de rede");
  });

  it("descreve o resultado sem inventar código", () => {
    assert.equal(descrever({ responde: true, status: 307, detalhe: null }), "Responde");
    assert.equal(descrever({ responde: false, status: 503, detalhe: null }), "Não responde (erro 503)");
    assert.equal(descrever({ responde: false, status: null, detalhe: "conexão recusada" }), "Não responde (conexão recusada)");
  });
});
