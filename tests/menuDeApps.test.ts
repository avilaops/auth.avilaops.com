import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Cadastro } from "@/lib/apps";
import { origemPermitida } from "@/lib/cors";
import { appsDaConta, menuDeApps } from "@/lib/menuDeApps";

function app(id: string, extra: Partial<Cadastro> = {}): Cadastro {
  return {
    id,
    host: `${id}.avilaops.com`,
    nome: id.toUpperCase(),
    tipo: "app",
    login: true,
    papelExigido: null,
    restrito: false,
    exigeSegundoFator: false,
    dicaDominioGoogle: null,
    deepLink: null,
    repositorio: null,
    servidor: null,
    publicacao: null,
    situacao: "no_ar",
    observacao: null,
    ...extra,
  };
}

const cadastro: Cadastro[] = [
  app("crm"),
  app("tms", { restrito: true }),
  app("app", { papelExigido: "ADMIN" }),
  app("erp", { situacao: "planejado" }),
  app("jobs", { situacao: "desativado" }),
  app("docs", { situacao: "fora_do_ar" }),
  app("conta"),
  app("avilaops-com", { tipo: "site", login: false }),
];
const ids = (m: { apps: { id: string }[] }) => m.apps.map((a) => a.id).join(",");

describe("menu de apps", () => {
  it("equipe vê tudo que recebe sessão e está no ar", () => {
    assert.equal(ids(menuDeApps(cadastro, "ADMIN", [])), "app,crm,tms");
  });

  it("cliente vê o aberto, e o restrito só com liberação", () => {
    assert.equal(ids(menuDeApps(cadastro, "CLIENTE", [])), "crm");
    assert.equal(ids(menuDeApps(cadastro, "CLIENTE", ["tms"])), "crm,tms");
  });

  it("liberação não abre aplicação só da equipe", () => {
    assert.equal(ids(menuDeApps(cadastro, "CLIENTE", ["app"])), "crm");
  });

  it("planejada, desativada, fora do ar e site não entram, nem com liberação", () => {
    assert.equal(ids(menuDeApps(cadastro, "CLIENTE", ["erp", "jobs", "docs", "avilaops-com"])), "crm");
  });

  it("a conta vai num campo próprio, fora da grade, e cada item leva nome e endereço", () => {
    const m = menuDeApps(cadastro, "ADMIN", []);
    assert.equal(m.conta, "https://conta.avilaops.com/");
    assert.deepEqual(m.apps[1], { id: "crm", nome: "CRM", url: "https://crm.avilaops.com/" });
  });

  it("CORS só para a casa", () => {
    assert.equal(origemPermitida("https://cms.avilaops.com"), "https://cms.avilaops.com");
    assert.equal(origemPermitida("https://avilaops.com"), "https://avilaops.com");
    assert.equal(origemPermitida("https://evil-avilaops.com"), null);
    assert.equal(origemPermitida("http://cms.avilaops.com"), null);
    assert.equal(origemPermitida(null), null);
  });

  it("a claim apps diz onde a conta tem direito de entrar, no ar ou não", () => {
    assert.deepEqual(appsDaConta(cadastro, "ADMIN", []), ["app", "conta", "crm", "docs", "erp", "tms"]);
    assert.deepEqual(appsDaConta(cadastro, "CLIENTE", []), ["conta", "crm", "docs", "erp"]);
    assert.deepEqual(appsDaConta(cadastro, "CLIENTE", ["tms", "app"]), ["conta", "crm", "docs", "erp", "tms"]);
  });

  it("desativada e site ficam fora da claim: o login não os reconhece", () => {
    const apps = appsDaConta(cadastro, "ADMIN", ["jobs", "avilaops-com"]);
    assert.equal(apps.includes("jobs"), false);
    assert.equal(apps.includes("avilaops-com"), false);
  });
});
