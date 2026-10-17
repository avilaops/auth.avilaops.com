import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { idGraph, lerEventoCadastro, lerPedidoCadastro, origemDaMeta } from "@/lib/cadastroWhatsapp";

/**
 * A janela da Meta fala por `postMessage`, e qualquer página aberta pode
 * mandar mensagem para esta. O que entra daqui vai para o servidor gravar um
 * número no cadastro da pessoa.
 */
describe("cadastro incorporado do WhatsApp", () => {
  it("só aceita mensagem de facebook.com em https", () => {
    for (const ok of ["https://www.facebook.com", "https://web.facebook.com", "https://facebook.com"]) assert.equal(origemDaMeta(ok), true, ok);
    for (const nao of ["http://www.facebook.com", "https://facebook.com.evil.io", "https://evilfacebook.com", "null", ""]) assert.equal(origemDaMeta(nao), false, nao);
  });

  it("conclusão traz a conta, o número e o negócio, em texto ou objeto", () => {
    const msg = { type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id: "1234567890", phone_number_id: "9876543210", business_id: "5555555555" } };
    const esperado = { estado: "concluido", wabaId: "1234567890", phoneNumberId: "9876543210", businessId: "5555555555" };
    assert.deepEqual(lerEventoCadastro(msg), esperado);
    assert.deepEqual(lerEventoCadastro(JSON.stringify(msg)), esperado);
  });

  it("toda variante de FINISH conclui; sem número, a conta basta", () => {
    assert.deepEqual(lerEventoCadastro({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_ONLY_WABA", data: { waba_id: "1234567890" } }), { estado: "concluido", wabaId: "1234567890", phoneNumberId: null, businessId: null });
    assert.equal(lerEventoCadastro({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", data: { waba_ids: ["1234567890"] } })?.estado, "concluido");
  });

  it("cancelar, erro informado e conclusão sem conta", () => {
    assert.deepEqual(lerEventoCadastro({ type: "WA_EMBEDDED_SIGNUP", event: "CANCEL", data: { current_step: "PHONE_NUMBER_SETUP" } }), { estado: "cancelado", etapa: "PHONE_NUMBER_SETUP" });
    assert.deepEqual(lerEventoCadastro({ type: "WA_EMBEDDED_SIGNUP", event: "CANCEL", data: { error_message: "número já usado" } }), { estado: "erro", mensagem: "número já usado" });
    assert.equal(lerEventoCadastro({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id: "../../me" } })?.estado, "erro");
  });

  it("outras mensagens são ignoradas", () => {
    for (const m of ["texto qualquer", "{", { type: "outra" }, null, 42, { type: "WA_EMBEDDED_SIGNUP" }]) assert.equal(lerEventoCadastro(m), null);
  });

  it("o servidor só aceita identificadores numéricos e um código plausível", () => {
    assert.deepEqual(lerPedidoCadastro({ code: "c".repeat(40), wabaId: "1234567890", phoneNumberId: "9876543210", businessId: null }), { code: "c".repeat(40), wabaId: "1234567890", phoneNumberId: "9876543210", businessId: null });
    assert.equal(lerPedidoCadastro({ code: "c".repeat(40), wabaId: "1234567890/subscribed_apps" }), null);
    assert.equal(lerPedidoCadastro({ code: "c".repeat(40), wabaId: "1234567890", phoneNumberId: "me" }), null);
    assert.equal(lerPedidoCadastro({ code: "curto", wabaId: "1234567890" }), null);
    assert.equal(lerPedidoCadastro(null), null);
    assert.equal(idGraph(1234567890), null);
  });
});
