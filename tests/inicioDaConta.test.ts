import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SistemasDaConta from "@/app/conta/SistemasDaConta";
import CarregandoConta from "@/app/conta/loading";
import ErroConta from "@/app/conta/error";
import { menuDeApps } from "@/lib/menuDeApps";
import { APPS_INICIAIS, type Cadastro } from "@/lib/apps";

const cadastro: Cadastro[] = APPS_INICIAIS.map((app) => ({
  ...app,
  papelExigido: app.papelExigido === "ADMIN" ? "ADMIN" : null,
  tipo: "app",
  login: true,
  restrito: app.restrito ?? false,
  exigeSegundoFator: false,
  dicaDominioGoogle: null,
  deepLink: null,
  repositorio: null,
  servidor: null,
  publicacao: null,
  situacao: "no_ar",
  observacao: null,
}));

describe("início da conta", () => {
  it("leva o cliente ao ERP pelo destino do produto, sem voltar ao login da conta", () => {
    const sistemas = menuDeApps(cadastro, "CLIENTE", []).apps;
    const html = renderToStaticMarkup(createElement(SistemasDaConta, { sistemas }));
    assert.match(html, /href="https:\/\/erp\.avilaops\.com\/"/);
    assert.match(html, /Abrir ERP/);
    assert.doesNotMatch(html, /href="\/login/);
    assert.doesNotMatch(html, /href="https:\/\/n8n\.avilaops\.com/);
    assert.match(html, /depende do seu vínculo e das permissões/);
  });

  it("não transforma falta de sistemas em acesso pendente ou convite fictício", () => {
    const html = renderToStaticMarkup(createElement(SistemasDaConta, { sistemas: [] }));
    assert.match(html, /Nenhum sistema disponível/);
    assert.match(html, /href="\/conta\?secao=dados"/);
    assert.match(html, /Se você recebeu um convite/);
    assert.doesNotMatch(html, /<button|Solicitação enviada|href="https:/);
  });

  it("distingue carregamento e falha do estado vazio", () => {
    const carregando = renderToStaticMarkup(createElement(CarregandoConta));
    const falha = renderToStaticMarkup(createElement(ErroConta));
    assert.match(carregando, /role="status"/);
    assert.match(carregando, /Carregando sua conta/);
    assert.match(falha, /role="alert"/);
    assert.match(falha, /Tentar novamente/);
    assert.doesNotMatch(carregando + falha, /Nenhum sistema disponível/);
  });

  it("escapa os nomes dos sistemas ao renderizar o destino autorizado", () => {
    const html = renderToStaticMarkup(createElement(SistemasDaConta, {
      sistemas: [{ id: "erp", nome: '<script>alert("x")</script>', url: "https://erp.avilaops.com/" }],
    }));
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });
});
