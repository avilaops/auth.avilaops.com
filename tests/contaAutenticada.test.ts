import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contaCorrespondeSessao } from "@/lib/contaAutenticada";
import type { Conta } from "@/lib/contas";
import type { Sessao } from "@/lib/sessao";

const sessao: Sessao = { sub: "pessoa", email: "pessoa@example.test", nome: "Nome antigo", papel: "CLIENTE", foto: null };
const conta: Conta = { id: "pessoa", email: sessao.email, nome: "Nome atual", role: "CLIENT", ativa: true,
  cpf: null, telefone: null, senhaProvisoria: false, criadoEm: new Date(), organizationId: null,
  ultimoAcessoEm: null, emailVerificado: false, mfaEmailAtivo: false, mfaEmailBloqueadoAte: null };

describe("identidade atual da conta", () => {
  it("aceita a conta ativa correspondente e permite atualização de nome", () => {
    assert.equal(contaCorrespondeSessao(conta, sessao), true);
    assert.equal(contaCorrespondeSessao({ ...conta, email: "PESSOA@example.test" }, sessao), true);
  });
  it("recusa conta ausente, bloqueada, outra identidade ou e-mail alterado", () => {
    for (const valor of [null, { ...conta, ativa: false }, { ...conta, id: "outra" }, { ...conta, email: "novo@example.test" }]) {
      assert.equal(contaCorrespondeSessao(valor, sessao), false);
    }
  });
  it("mudança de papel exige autenticação nova, inclusive promoção e rebaixamento", () => {
    assert.equal(contaCorrespondeSessao({ ...conta, role: "OWNER" }, sessao), false);
    assert.equal(contaCorrespondeSessao(conta, { ...sessao, papel: "ADMIN" }), false);
  });
});
