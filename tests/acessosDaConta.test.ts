import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import AcessosDaConta from "@/app/conta/AcessosDaConta";

describe("identidade, acesso e empresa na conta", () => {
  it("distingue e-mail pendente e conta sem vínculo, sem inventar convite", () => {
    const html = renderToStaticMarkup(createElement(AcessosDaConta, { emailVerificado: false, vinculos: [], temMais: false }));
    assert.match(html, /E-mail ainda não confirmado/);
    assert.match(html, /Nenhum vínculo de empresa registrado/);
    assert.match(html, /Se você recebeu um convite/);
    assert.doesNotMatch(html, /Convite pendente|href="https:|<select|<form/);
  });
  it("identifica empresa, sistema e papel; bloqueio não é acesso ativo", () => {
    const html = renderToStaticMarkup(createElement(AcessosDaConta, { emailVerificado: true, temMais: true, vinculos: [
      { id: "a", empresa: "Empresa <Alfa>", sistema: "ERP", situacao: "ATIVO", acessoAoSistema: true, papeis: [{ papel: "COMPRADOR", unidade: "Matriz" }] },
      { id: "b", empresa: "Beta", sistema: "ERP", situacao: "SUSPENSO", acessoAoSistema: false, papeis: [] },
      { id: "c", empresa: "Gama", sistema: "CRM", situacao: "REVOGADO", acessoAoSistema: true, papeis: [] },
    ] }));
    assert.match(html, /E-mail confirmado/);
    assert.match(html, /Empresa &lt;Alfa&gt;/);
    assert.match(html, /Comprador/);
    assert.match(html, /Matriz/);
    assert.match(html, /Vínculo suspenso/);
    assert.match(html, /Vínculo removido/);
    assert.match(html, /Sistema sem acesso/);
    assert.match(html, /primeiros 50/);
    assert.match(html, /selecionada dentro de cada sistema/);
    assert.doesNotMatch(html, /<select|<form|href="https:/);
  });
});
