import assert from "node:assert/strict";
import { createPublicKey } from "node:crypto";
import { describe, it } from "node:test";
import jwt from "jsonwebtoken";
import { gerarPar, paraJwks } from "@/lib/chaveOidc";
import { assinarAccessToken, assinarIdTokenCom, documentoDescoberta, EMISSOR, verificarAccessToken } from "@/lib/oidc";

process.env.SSO_JWT_SECRET = "segredo-de-teste";

const pessoa = { sub: "c1", email: "ana@exemplo.com", nome: "Ana", foto: null, papel: "CLIENTE" as const };

describe("assinatura do id_token", () => {
  const par = gerarPar();
  const chave = { kid: par.kid, privadaPem: par.privadaPem };
  const jwk = paraJwks(par.kid, par.publicaJwk);

  it("com chave: RS256, com o kid, conferível só com a chave pública do JWKS", () => {
    const token = assinarIdTokenCom(chave, pessoa, "tms", "n-1");
    const cabecalho = jwt.decode(token, { complete: true })?.header;
    assert.equal(cabecalho?.alg, "RS256");
    assert.equal(cabecalho?.kid, par.kid);

    const publica = createPublicKey({ key: jwk, format: "jwk" });
    const p = jwt.verify(token, publica, { algorithms: ["RS256"], issuer: EMISSOR, audience: "tms" }) as jwt.JwtPayload;
    assert.equal(p.sub, "c1");
    assert.equal(p.email, "ana@exemplo.com");
    assert.equal(p.nonce, "n-1");
  });

  it("o JWKS só leva a parte pública", () => {
    assert.deepEqual(Object.keys(jwk).sort(), ["alg", "e", "kid", "kty", "n", "use"]);
    assert.equal(jwk.kty, "RSA");
  });

  it("chave de outro par não confere", () => {
    const token = assinarIdTokenCom(chave, pessoa, "tms", null);
    const outra = createPublicKey({ key: gerarPar().publicaJwk, format: "jwk" });
    assert.throws(() => jwt.verify(token, outra, { algorithms: ["RS256"] }));
  });

  it("sem chave: HS256 com o segredo da sessão, como antes", () => {
    const token = assinarIdTokenCom(null, pessoa, "notas", null);
    assert.equal(jwt.decode(token, { complete: true })?.header.alg, "HS256");
  });

  it("id_token RS256 não passa por access token no userinfo", () => {
    assert.equal(verificarAccessToken(assinarIdTokenCom(chave, pessoa, "tms", null)), null);
    assert.equal(verificarAccessToken(assinarAccessToken(pessoa, "tms"))?.email, "ana@exemplo.com");
  });

  it("a descoberta anuncia o que de fato é assinado", () => {
    const com = documentoDescoberta(true);
    assert.deepEqual(com.id_token_signing_alg_values_supported, ["RS256"]);
    assert.match(String(com.jwks_uri), /\/oauth\/jwks$/);
    const sem = documentoDescoberta(false);
    assert.deepEqual(sem.id_token_signing_alg_values_supported, ["HS256"]);
    assert.equal("jwks_uri" in sem, false);
  });
});
