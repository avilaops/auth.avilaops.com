import assert from "node:assert/strict";
import { createPublicKey } from "node:crypto";
import { describe, it } from "node:test";
import jwt from "jsonwebtoken";
import { ESPERA_DA_TROCA_MS, gerarPar, paraJwks, RETENCAO_DA_ANTIGA_MS, situacaoDasChaves } from "@/lib/chaveOidc";
import { assinarAccessToken, assinarIdTokenCom, documentoDescoberta, EMISSOR, TTL_TOKEN_SEGUNDOS, verificarAccessToken } from "@/lib/oidc";

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

  it("a claim apps vai no id_token quando informada, e só nele", () => {
    const com = jwt.decode(assinarIdTokenCom(chave, pessoa, "cms", null, ["cms", "conta"])) as jwt.JwtPayload;
    assert.deepEqual(com.apps, ["cms", "conta"]);
    assert.equal("apps" in (jwt.decode(assinarIdTokenCom(chave, pessoa, "cms", null)) as jwt.JwtPayload), false);
    assert.equal("apps" in (jwt.decode(assinarAccessToken(pessoa, "cms")) as jwt.JwtPayload), false);
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

describe("troca da chave de assinatura", () => {
  const hora = 60 * 60 * 1000;
  const t0 = 1_700_000_000_000;
  const chave = (kid: string, assinaDesde: number) => ({ kid, assinaDesde: new Date(assinaDesde) });
  const kids = (l: { kid: string }[]) => l.map((c) => c.kid);

  it("a antiga fica publicada mais que a validade do id_token", () => {
    assert.ok(RETENCAO_DA_ANTIGA_MS > TTL_TOKEN_SEGUNDOS * 1000);
  });

  it("troca agendada: a nova é publicada antes de assinar", () => {
    const linhas = [chave("velha", t0), chave("nova", t0 + ESPERA_DA_TROCA_MS)];
    const s = situacaoDasChaves(linhas, t0 + hora);
    assert.equal(s.assina?.kid, "velha");
    assert.equal(s.proxima?.kid, "nova");
    assert.deepEqual(kids(s.publicadas), ["velha", "nova"]);
    assert.deepEqual(s.vencidas, []);
  });

  it("quando a nova começa, a velha para de assinar mas segue publicada até a retenção acabar", () => {
    const linhas = [chave("velha", t0), chave("nova", t0 + ESPERA_DA_TROCA_MS)];
    const virou = t0 + ESPERA_DA_TROCA_MS;
    const logoDepois = situacaoDasChaves(linhas, virou + hora);
    assert.equal(logoDepois.assina?.kid, "nova");
    assert.equal(logoDepois.proxima, null);
    assert.deepEqual(kids(logoDepois.publicadas), ["velha", "nova"]);
    const passou = situacaoDasChaves(linhas, virou + RETENCAO_DA_ANTIGA_MS);
    assert.deepEqual(kids(passou.publicadas), ["nova"]);
    assert.deepEqual(kids(passou.vencidas), ["velha"]);
  });

  it("duas chaves nascidas juntas: todo mundo assina com a mesma, e as duas vão no JWKS", () => {
    const s = situacaoDasChaves([chave("b", t0), chave("a", t0)], t0 + 1000);
    assert.equal(s.assina?.kid, "b");
    assert.deepEqual(kids(s.publicadas), ["a", "b"]);
  });

  it("sem chave nenhuma não há quem assine", () => {
    const s = situacaoDasChaves([], t0);
    assert.equal(s.assina, null);
    assert.deepEqual(s.publicadas, []);
  });
});
