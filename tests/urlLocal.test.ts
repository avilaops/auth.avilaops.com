import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { baseDaAplicacao } from "@/lib/baseDaAplicacao";
import { APPS_INICIAIS, returnToSeguro } from "@/lib/apps";

describe("destino de aplicação em DEV isolado", () => {
  const dev = { NODE_ENV: "development", AUTH_EMAIL_LOCAL: "1", SSO_BASE_URL: "http://127.0.0.1:3010" };
  it("permite HTTP exclusivamente no loopback com DEV local explicitamente ativo", () => {
    assert.equal(baseDaAplicacao("127.0.0.1:3011", dev), "http://127.0.0.1:3011/");
    assert.equal(baseDaAplicacao("erp.avilaops.com", dev), "https://erp.avilaops.com/");
    assert.equal(baseDaAplicacao("127.0.0.1.evil.test", dev), "https://127.0.0.1.evil.test/");
    for (const extra of [{ NODE_ENV: "production" }, { AUTH_EMAIL_LOCAL: "0" }, { SSO_BASE_URL: "https://auth.avilaops.com" }]) {
      assert.equal(baseDaAplicacao("127.0.0.1:3011", { ...dev, ...extra }), "https://127.0.0.1:3011/");
    }
  });
  it("o retorno DEV preserva origem e porta exatas e recusa credenciais e outros destinos", () => {
    const anterior = { NODE_ENV: process.env.NODE_ENV, AUTH_EMAIL_LOCAL: process.env.AUTH_EMAIL_LOCAL, SSO_BASE_URL: process.env.SSO_BASE_URL };
    try {
      Object.assign(process.env, dev);
      const app = { ...APPS_INICIAIS[0], id: "dev", host: "127.0.0.1:3011" };
      assert.equal(returnToSeguro("http://127.0.0.1:3011/projeto", app), "http://127.0.0.1:3011/projeto");
      for (const destino of ["http://127.0.0.1:3012/projeto", "http://user:pass@127.0.0.1:3011/projeto", "http://127.0.0.1.evil.test/projeto", "https://evil.test/"]) {
        assert.equal(returnToSeguro(destino, app), "http://127.0.0.1:3011/");
      }
    } finally {
      for (const [nome, valor] of Object.entries(anterior)) {
        if (valor === undefined) delete process.env[nome]; else process.env[nome] = valor;
      }
    }
  });
});
