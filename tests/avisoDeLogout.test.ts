import assert from "node:assert/strict";
import { createPublicKey } from "node:crypto";
import { describe, it } from "node:test";
import jwt from "jsonwebtoken";
import { EVENTO_DE_LOGOUT, montarLogoutToken } from "@/lib/avisoDeLogout";
import { gerarPar, paraJwks } from "@/lib/chaveOidc";
import { validarIntegracao } from "@/lib/clientesOidc";
import { documentoDescoberta } from "@/lib/oidc";

const base = { id: "crm", appId: "crm", nome: "CRM", acessoMeta: false, ativo: true, redirectUris: "https://crm.avilaops.com/cb" };

describe("aviso de saída aos sistemas", () => {
  const par = gerarPar();
  const chave = { kid: par.kid, privadaPem: par.privadaPem };
  const publica = createPublicKey({ key: paraJwks(par.kid, par.publicaJwk), format: "jwk" });

  it("o logout_token é RS256, conferível pelo JWKS, e diz quem saiu e para qual cliente", () => {
    const token = montarLogoutToken(chave, "crm", "conta-1");
    const cabecalho = jwt.decode(token, { complete: true })?.header;
    assert.equal(cabecalho?.alg, "RS256");
    assert.equal(cabecalho?.typ, "logout+jwt");
    assert.equal(cabecalho?.kid, par.kid);
    const p = jwt.verify(token, publica, { algorithms: ["RS256"], issuer: "https://auth.avilaops.com", audience: "crm" }) as jwt.JwtPayload;
    assert.equal(p.sub, "conta-1");
    assert.deepEqual(p.events, { [EVENTO_DE_LOGOUT]: {} });
    assert.ok(p.jti);
    assert.equal("nonce" in p, false);
    assert.ok((p.exp ?? 0) - (p.iat ?? 0) <= 120);
  });

  it("cada aviso tem identificador próprio", () => {
    const a = jwt.decode(montarLogoutToken(chave, "crm", "c")) as jwt.JwtPayload;
    const b = jwt.decode(montarLogoutToken(chave, "crm", "c")) as jwt.JwtPayload;
    assert.notEqual(a.jti, b.jti);
  });

  it("o endereço de aviso segue as regras do retorno", () => {
    const ok = validarIntegracao({ ...base, logoutUri: " https://crm.avilaops.com/sair-aviso " }, { exigeRetorno: true });
    assert.ok(ok.ok);
    assert.equal(ok.dados.logoutUri, "https://crm.avilaops.com/sair-aviso");
    for (const uri of ["http://crm.avilaops.com/sair", "https://crm.avilaops.com/sair#x", "https://*.avilaops.com/sair", "nao-e-url"]) {
      assert.equal(validarIntegracao({ ...base, logoutUri: uri }, { exigeRetorno: true }).ok, false, uri);
    }
  });

  it("em branco fica sem aviso, e integração só de API não pode ter", () => {
    const vazio = validarIntegracao({ ...base, logoutUri: "  " }, { exigeRetorno: true });
    assert.ok(vazio.ok);
    assert.equal(vazio.dados.logoutUri, null);
    assert.equal(validarIntegracao({ ...base, redirectUris: "", acessoMeta: true, logoutUri: "https://crm.avilaops.com/sair" }, { exigeRetorno: false }).ok, false);
  });

  it("a descoberta só anuncia o aviso quando há chave para assiná-lo", () => {
    assert.equal(documentoDescoberta(true).backchannel_logout_supported, true);
    assert.equal(documentoDescoberta(false).backchannel_logout_supported, false);
  });
});
