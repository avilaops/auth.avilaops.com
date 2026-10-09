import assert from "node:assert/strict";
import { describe, it } from "node:test";
import jwt from "jsonwebtoken";

process.env.SSO_JWT_SECRET = "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres";
process.env.SSO_BASE_URL = "https://auth.exemplo.test";

const { destinoDepoisDoCadastro, emailAceito, emailDeConfirmacao, emailDeContaExistente, lerTokenDeCadastro, linkDeConfirmacao, nomeAceito, tokenDeCadastro } = await import("@/lib/cadastroProprio");
const { assinarSessao, verificarSessao } = await import("@/lib/sessao");

const pedido = { email: "  Maria@Loja.Test ", nome: " Maria Souza ", app: "crm", returnTo: "https://crm.avilaops.com/api/auth/sso" };

describe("link de confirmação do cadastro", () => {
  it("carrega o pedido, com e-mail normalizado, e volta inteiro", () => {
    assert.deepEqual(lerTokenDeCadastro(tokenDeCadastro(pedido)), { email: "maria@loja.test", nome: "Maria Souza", app: "crm", returnTo: "https://crm.avilaops.com/api/auth/sso" });
  });

  it("adulterado, vencido ou vazio não vale", () => {
    const token = tokenDeCadastro(pedido);
    const [cabecalho, corpo, assinatura] = token.split(".");
    const outro = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(corpo, "base64url").toString()), email: "invasor@x.test" })).toString("base64url");
    assert.equal(lerTokenDeCadastro(`${cabecalho}.${outro}.${assinatura}`), null);
    assert.equal(lerTokenDeCadastro(""), null);
    assert.equal(lerTokenDeCadastro("a.b.c"), null);
    const vencido = jwt.sign({ p: "cadastro-proprio", email: "a@b.test", nome: "Ana", exp: Math.floor(Date.now() / 1000) - 10 }, "qualquer");
    assert.equal(lerTokenDeCadastro(vencido), null);
  });

  it("não serve de sessão, e sessão não serve de cadastro", () => {
    assert.equal(verificarSessao(tokenDeCadastro(pedido)), null);
    const sessao = assinarSessao({ sub: "c1", email: "maria@loja.test", nome: "Maria", foto: null, papel: "CLIENTE" });
    assert.equal(lerTokenDeCadastro(sessao), null);
    // Assinado com o segredo da sessão direto, sem a chave derivada: recusado.
    const forjado = jwt.sign({ p: "cadastro-proprio", email: "a@b.test", nome: "Ana" }, process.env.SSO_JWT_SECRET!, { expiresIn: 600 });
    assert.equal(lerTokenDeCadastro(forjado), null);
  });

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

  it("os e-mails trazem o link em texto e em HTML, com o nome escapado", () => {
    const confirmacao = emailDeConfirmacao("Zé & Cia", "https://auth.exemplo.test/criar/confirmar/abc");
    assert.ok(confirmacao.texto.includes("https://auth.exemplo.test/criar/confirmar/abc"));
    assert.ok(confirmacao.html.includes('href="https://auth.exemplo.test/criar/confirmar/abc"'));
    assert.ok(confirmacao.html.includes("Zé") && !confirmacao.html.includes("Zé & Cia"));
    const existente = emailDeContaExistente("https://auth.exemplo.test/recuperar/xyz");
    assert.ok(existente.texto.includes("já tem conta") && existente.html.includes("/recuperar/xyz"));
  });
});
