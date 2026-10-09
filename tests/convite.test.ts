import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ehPrimeiraSenha, podeReemitirConvite } from "@/lib/convite";

const pendente = { senhaProvisoria: true, ultimoAcessoEm: null, criadaPor: "app:erp" };

describe("reemissão do convite pedido por um sistema", () => {
  it("reemite para a conta que o próprio sistema criou e a pessoa ainda não assumiu", () => {
    assert.equal(podeReemitirConvite(pendente, "app:erp"), true);
  });

  it("nega para conta criada por outro sistema", () => {
    assert.equal(podeReemitirConvite(pendente, "app:tms"), false);
  });

  it("nega para conta criada no painel ou pelo cadastro próprio", () => {
    assert.equal(podeReemitirConvite({ ...pendente, criadaPor: "ana@avilaops.com" }, "app:erp"), false);
    assert.equal(podeReemitirConvite({ ...pendente, criadaPor: null }, "app:erp"), false);
  });

  it("nega depois que a pessoa escolheu a senha", () => {
    assert.equal(podeReemitirConvite({ ...pendente, senhaProvisoria: false }, "app:erp"), false);
  });

  it("nega para quem já entrou alguma vez", () => {
    assert.equal(podeReemitirConvite({ ...pendente, ultimoAcessoEm: new Date() }, "app:erp"), false);
  });
});

describe("primeira senha", () => {
  it("é primeira senha só com senha provisória e nenhum acesso", () => {
    assert.equal(ehPrimeiraSenha(pendente), true);
    assert.equal(ehPrimeiraSenha({ senhaProvisoria: false, ultimoAcessoEm: null }), false);
    assert.equal(ehPrimeiraSenha({ senhaProvisoria: true, ultimoAcessoEm: new Date() }), false);
  });
});
