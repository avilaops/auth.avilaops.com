import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { avisosDaRodada, descrever, divergencia, interpretar, motivoDaFalha, precisaConferir, VALIDADE_MS, vencida, type Observacao } from "@/lib/conferencia";
import { destinatariosDoAviso, mensagemDoAviso } from "@/lib/rotinaDeConferencia";

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

  const obs = (id: string, situacao: Observacao["situacao"], antes: boolean | null, depois: boolean): Observacao => ({ id, host: `${id}.exemplo.com`, situacao, antes, depois, detalhe: depois ? "Responde" : "Não responde (erro 502)" });

  it("só avisa mudança de aplicação cadastrada como no ar", () => {
    const avisos = avisosDaRodada([
      obs("caiu", "no_ar", true, false),
      obs("voltou", "no_ar", false, true),
      obs("segue-fora", "no_ar", false, false),
      obs("segue-bem", "no_ar", true, true),
      obs("primeira-vez", "no_ar", null, false),
      obs("informada-fora", "fora_do_ar", true, false),
    ]);
    assert.deepEqual(avisos.map((a) => `${a.id}:${a.tipo}`), ["caiu:parou", "voltou:voltou"]);
  });

  it("o assunto diz o que aconteceu e o corpo lista os endereços", () => {
    const uma = mensagemDoAviso(avisosDaRodada([obs("crm", "no_ar", true, false)]));
    assert.equal(uma.assunto, "crm.exemplo.com parou de responder");
    assert.match(uma.texto, /- crm\.exemplo\.com: Não responde \(erro 502\)/);
    const varias = mensagemDoAviso(avisosDaRodada([obs("a", "no_ar", true, false), obs("b", "no_ar", true, false), obs("c", "no_ar", false, true)]));
    assert.equal(varias.assunto, "2 aplicações pararam de responder");
    assert.match(varias.texto, /Voltaram a responder:\n- c\.exemplo\.com/);
    assert.equal(mensagemDoAviso(avisosDaRodada([obs("c", "no_ar", false, true)])).assunto, "c.exemplo.com voltou a responder");
  });

  it("quem recebe é quem abre o painel", () => {
    assert.deepEqual(destinatariosDoAviso({ SSO_SUPERADMINS: " Nicolas@avilaops.com , socio@avilaops.com " }), ["nicolas@avilaops.com", "socio@avilaops.com"]);
    assert.deepEqual(destinatariosDoAviso({}), []);
  });
});
