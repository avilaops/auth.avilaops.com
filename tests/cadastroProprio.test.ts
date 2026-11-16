import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.SSO_BASE_URL = "https://auth.exemplo.test";

const { cpfAceito, cpfNormalizado, destinoDepoisDoCadastro, emailAceito, emailDeConfirmacao, emailDeContaExistente, linkDeConfirmacao, nomeAceito, telefoneAceito } = await import("@/lib/cadastroProprio");

describe("link e dados do cadastro", () => {
  it("o link aponta para o auth, e o destino final passa pela tela de login", () => {
    assert.ok(linkDeConfirmacao("abc").startsWith("https://auth.exemplo.test/criar/confirmar/abc"));
    assert.equal(destinoDepoisDoCadastro({ app: "crm", returnTo: "https://crm.avilaops.com/x" }), "/login?app=crm&returnTo=https%3A%2F%2Fcrm.avilaops.com%2Fx");
    assert.equal(destinoDepoisDoCadastro({ app: null, returnTo: "/oauth/authorize?client_id=tms" }), "/login?returnTo=%2Foauth%2Fauthorize%3Fclient_id%3Dtms");
    assert.equal(destinoDepoisDoCadastro({ app: null, returnTo: null }), "/conta");
  });
});

describe("o que o cadastro aceita", () => {
  it("e-mail e nome plausíveis passam; o que quebraria cabeçalho ou tela, não", () => {
    assert.equal(emailAceito("maria@loja.com.br"), true);
    for (const ruim of ["maria", "maria@loja", "a b@c.com", "x@y.c", "<x>@y.com", `${"a".repeat(250)}@b.com`]) assert.equal(emailAceito(ruim), false, ruim);
    assert.equal(nomeAceito("Maria Souza"), true);
    for (const ruim of ["", "M", "Maria\r\nBcc: x@y.com", "<script>", "a".repeat(121)]) assert.equal(nomeAceito(ruim), false, JSON.stringify(ruim));
  });

  it("confere CPF e telefone antes de guardar o cadastro pendente", () => {
    assert.equal(cpfAceito("529.982.247-25"), true);
    assert.equal(cpfNormalizado("529.982.247-25"), "52998224725");
    for (const ruim of ["", "111.111.111-11", "529.982.247-24"]) assert.equal(cpfAceito(ruim), false, ruim);
    assert.equal(telefoneAceito("+55 (11) 98765-4321"), true);
    for (const ruim of ["", "98765-4321", "11".repeat(16)]) assert.equal(telefoneAceito(ruim), false, ruim);
  });

  it("os e-mails trazem o link em texto e em HTML, com o nome escapado", () => {
    const confirmacao = emailDeConfirmacao("Zé & Cia", "https://auth.exemplo.test/criar/confirmar/abc");
    assert.ok(confirmacao.texto.includes("https://auth.exemplo.test/criar/confirmar/abc"));
    assert.ok(confirmacao.html.includes('href="https://auth.exemplo.test/criar/confirmar/abc"'));
    assert.ok(confirmacao.html.includes("Zé") && !confirmacao.html.includes("Zé & Cia"));
    const existente = emailDeContaExistente("https://auth.exemplo.test/recuperar/xyz");
    assert.ok(existente.texto.includes("já tem conta") && existente.html.includes("/recuperar/xyz"));
  });
});
