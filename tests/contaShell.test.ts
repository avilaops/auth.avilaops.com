import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ContaShell from "@/app/conta/ContaShell";

describe("estrutura de Minha conta", () => {
  const props = { nome: "Pessoa Exemplo", email: "pessoa@example.com", equipe: false, painel: false, secao: "inicio" as const, children: "Conteúdo autorizado" };
  it("mantém a saída por POST e não oferece o painel ao cliente", () => {
    const html = renderToStaticMarkup(createElement(ContaShell, props));
    assert.match(html, /action="\/api\/auth\/logout" method="post"/);
    assert.doesNotMatch(html, /href="\/admin"/);
    assert.match(html, /Conteúdo autorizado/);
    assert.match(html, /aria-current="page"/);
    assert.match(html, /href="\/conta\?secao=seguranca"/);
    assert.doesNotMatch(html, /href="\/conta\/meta"/);
  });
  it("exibe o painel apenas quando a página autorizou e escapa a identidade", () => {
    const html = renderToStaticMarkup(createElement(ContaShell, { ...props, nome: "<script>nome</script>", painel: true }));
    assert.match(html, /href="\/admin"/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });
});
