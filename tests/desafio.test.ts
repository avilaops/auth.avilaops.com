import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.SSO_JWT_SECRET = "segredo-de-teste-que-nao-e-o-de-producao";

const { assinarDesafio, verificarDesafio } = await import("@/lib/desafio");
const { assinarSessao, verificarSessao } = await import("@/lib/sessao");

const DESAFIO = {
  sub: "conta-1",
  email: "nicolas@avilaops.com",
  nome: "Nicolas",
  foto: null,
  papel: "ADMIN" as const,
  motivo: "verificar" as const,
  destino: "/admin",
  appId: null,
  via: "senha",
  senhaProvisoria: false,
  deepLink: null,
};

const SESSAO = { sub: "conta-1", email: "nicolas@avilaops.com", nome: "Nicolas", foto: null, papel: "ADMIN" as const, mfa: true };

/**
 * A propriedade que sustenta o segundo fator inteiro.
 *
 * O bilhete de desafio vive num cookie do mesmo navegador, ao lado do cookie de
 * sessão. Se ele valesse como sessão, qualquer pessoa que passasse pela senha
 * copiaria o valor de um cookie para o outro e pularia a segunda etapa — sem
 * ferramenta nenhuma, só o inspetor do navegador. É por isso que ele é assinado
 * com chave derivada e emissor próprio.
 */
describe("bilhete de desafio e cookie de sessão não se misturam", () => {
  it("o desafio vale como desafio", () => {
    const lido = verificarDesafio(assinarDesafio(DESAFIO));
    assert.equal(lido?.email, DESAFIO.email);
    assert.equal(lido?.motivo, "verificar");
    assert.equal(lido?.destino, "/admin");
  });

  it("o desafio NÃO vale como sessão", () => {
    assert.equal(verificarSessao(assinarDesafio(DESAFIO)), null);
  });

  it("a sessão NÃO vale como desafio", () => {
    assert.equal(verificarDesafio(assinarSessao(SESSAO)), null);
  });

  it("a sessão carrega se o segundo fator foi conferido", () => {
    assert.equal(verificarSessao(assinarSessao(SESSAO))?.mfa, true);
    assert.equal(verificarSessao(assinarSessao({ ...SESSAO, mfa: false }))?.mfa, false);
  });

  it("token adulterado é recusado", () => {
    const token = assinarDesafio(DESAFIO);
    assert.equal(verificarDesafio(token.slice(0, -3) + "xyz"), null);
    assert.equal(verificarDesafio(""), null);
    assert.equal(verificarDesafio("nem.parece.jwt"), null);
  });

  it("token assinado com outro segredo é recusado", () => {
    const token = assinarDesafio(DESAFIO);
    process.env.SSO_JWT_SECRET = "outro-segredo-qualquer";
    try {
      assert.equal(verificarDesafio(token), null);
    } finally {
      process.env.SSO_JWT_SECRET = "segredo-de-teste-que-nao-e-o-de-producao";
    }
  });
});
