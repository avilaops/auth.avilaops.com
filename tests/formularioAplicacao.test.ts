import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import CamposAplicacao from "@/app/admin/apps/CamposAplicacao";

describe("formulário de aplicação", () => {
  it("inicia restrito com uma única escolha de acesso e orienta o cadastro de callbacks", () => {
    const html = renderToStaticMarkup(createElement(CamposAplicacao, { c: null }));
    assert.match(html, /value="clientes_liberados" selected=""/);
    assert.equal((html.match(/name="modoAcesso"/g) ?? []).length, 1);
    for (const campo of ["login", "papelExigido", "restrito"]) {
      assert.ok(!html.includes(`name="${campo}"`), campo);
    }
    assert.match(html, /href="\/admin\/integracoes"/);
    assert.match(html, /Callback, retorno após logout e aviso de saída/);
  });
});
