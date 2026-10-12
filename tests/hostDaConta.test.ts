import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decidirNoHostDaConta, ehHostDaConta } from "@/lib/hostDaConta";

const AUTH = "https://auth.avilaops.com";

describe("conta.avilaops.com", () => {
  it("reconhece o host, com porta e em maiúsculas, e não confunde parecidos", () => {
    assert.equal(ehHostDaConta("conta.avilaops.com"), true);
    assert.equal(ehHostDaConta("Conta.AvilaOps.com:3010"), true);
    assert.equal(ehHostDaConta("auth.avilaops.com"), false);
    assert.equal(ehHostDaConta("conta.avilaops.com.evil.io"), false);
    assert.equal(ehHostDaConta(null), false);
  });

  it("a raiz é a página da conta", () => {
    assert.deepEqual(decidirNoHostDaConta("/", "?secao=dados", AUTH), { tipo: "reescrever", caminho: "/conta" });
  });

  it("a página, as chamadas de API e os arquivos passam como estão", () => {
    for (const caminho of ["/conta", "/conta/meta", "/api/auth/logout", "/api/auth/mfa/iniciar", "/_next/static/x.js", "/favicon.ico", "/marca/logo.svg"]) {
      assert.deepEqual(decidirNoHostDaConta(caminho, "", AUTH), { tipo: "seguir" }, caminho);
    }
  });

  it("o login é o do Auth, pedindo a volta para cá", () => {
    const d = decidirNoHostDaConta("/login", "?returnTo=/conta", AUTH);
    assert.equal(d.tipo, "redirecionar");
    const url = new URL(d.tipo === "redirecionar" ? d.url : "");
    assert.equal(url.origin + url.pathname, "https://auth.avilaops.com/login");
    assert.equal(url.searchParams.get("app"), "conta");
    assert.equal(url.searchParams.get("returnTo"), "https://conta.avilaops.com/");
  });

  it("painel, OIDC e senha são do Auth: vão para lá, no mesmo caminho", () => {
    assert.deepEqual(decidirNoHostDaConta("/admin/apps", "?f_tipo=site", AUTH), { tipo: "redirecionar", url: "https://auth.avilaops.com/admin/apps?f_tipo=site" });
    assert.deepEqual(decidirNoHostDaConta("/trocar-senha", "?returnTo=%2Fconta", AUTH), { tipo: "redirecionar", url: "https://auth.avilaops.com/trocar-senha?returnTo=%2Fconta" });
    assert.deepEqual(decidirNoHostDaConta("/.well-known/openid-configuration", "", AUTH), { tipo: "redirecionar", url: "https://auth.avilaops.com/.well-known/openid-configuration" });
    assert.deepEqual(decidirNoHostDaConta("/contabilidade", "", AUTH).tipo, "redirecionar");
  });
});
