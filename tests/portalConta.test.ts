import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { paginaDaConta } from "@/lib/secoesDaConta";
import ResumoDaConta from "@/app/conta/ResumoDaConta";
import PaginacaoConta from "@/app/conta/PaginacaoConta";
import { emailDeConfirmacaoDaConta } from "@/lib/emailConfirmacao";

describe("portal funcional da conta", () => {
  it("atalhos levam às quatro áreas e mostram os estados reais da conta", () => {
    const html = renderToStaticMarkup(createElement(ResumoDaConta, { emailVerificado: false, autenticadorAtivo: true }));
    for (const secao of ["dados", "seguranca", "empresas", "conexoes"]) assert.match(html, new RegExp(`href="/conta\\?secao=${secao}"`));
    assert.match(html, /E-mail pendente de confirmação • Autenticador ativo/);
    assert.doesNotMatch(html, /100%|segurança garantida|disabled/);
  });
  it("paginação mantém seção e oferece somente movimentos possíveis", () => {
    const primeira = renderToStaticMarkup(createElement(PaginacaoConta, { pagina: 1, temMais: true, secao: "empresas" }));
    assert.match(primeira, /secao=empresas&amp;pagina=2/); assert.doesNotMatch(primeira, /Página anterior/);
    const ultima = renderToStaticMarkup(createElement(PaginacaoConta, { pagina: 2, temMais: false, secao: "conexoes" }));
    assert.match(ultima, /secao=conexoes&amp;pagina=1/); assert.doesNotMatch(ultima, /Próxima página/);
    assert.equal(renderToStaticMarkup(createElement(PaginacaoConta, { pagina: 1, temMais: false, secao: "empresas" })), "");
  });
  it("página inválida ou repetida não vira offset arbitrário", () => {
    for (const valor of [undefined, "-1", "0", "1.5", "999999999999999999", ["1", "2"], NaN, Infinity, -3, 1.5]) assert.equal(paginaDaConta(valor), 1);
    assert.equal(paginaDaConta("2"), 2); assert.equal(paginaDaConta(3), 3);
  });
  it("mensagem de confirmação escapa o nome e usa link próprio e token válido", () => {
    const mensagem = emailDeConfirmacaoDaConta('<img src=x onerror="alert(1)">', "a".repeat(64));
    assert.doesNotMatch(mensagem.html, /<img/); assert.match(mensagem.html, /&lt;img/);
    assert.match(mensagem.texto, /\/conta\/confirmar-email\/a{64}/);
    assert.match(mensagem.texto, /30 minutos/); assert.match(mensagem.assunto, / • /);
    assert.throws(() => emailDeConfirmacaoDaConta("Nome", "../fora"));
  });
});
