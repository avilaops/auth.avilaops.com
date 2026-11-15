import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, it, mock } from "node:test";
import jwt from "jsonwebtoken";
import { buscarProvedor, resolverUrl } from "@/lib/provedores";
import { baseGovBr, validarTokensGovBr } from "@/lib/govbr";

afterEach(() => mock.restoreAll());
describe("gov.br • acesso central", () => {
  it("usa PKCE e mantém todos os endpoints no ambiente escolhido", () => {
    const p = buscarProvedor("govbr")!;
    assert.equal(p.pkce, true);
    assert.equal(resolverUrl(p.userinfoUrl!, { ambiente: "staging" }), "https://sso.staging.acesso.gov.br/userinfo");
    assert.equal(resolverUrl(p.tokenUrl, { ambiente: "producao" }), "https://sso.acesso.gov.br/token");
    assert.throws(() => baseGovBr({ ambiente: "invalido" }));
  });
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = { ...publicKey.export({ format: "jwk" }), kid: "teste", alg: "RS256" };
  const token = (dados: Record<string, unknown>) => jwt.sign(dados, privateKey, { algorithm: "RS256", keyid: "teste", expiresIn: "1m", issuer: "https://sso.staging.acesso.gov.br/" });
  const cred = { clientId: "app", clientSecret: "segredo-sintetico", extras: { ambiente: "staging" } };
  it("confere assinatura, emissor, audiência, nonce e sujeito antes de usar identidade", async () => {
    mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ keys: [key] })));
    const access_token = token({ sub: "pessoa" });
    const id_token = token({ sub: "pessoa", aud: "app", nonce: "nonce" });
    const r = await validarTokensGovBr({ access_token, id_token }, cred, "nonce");
    assert.equal(r.sub, "pessoa");
    for (const dados of [{ sub: "pessoa", aud: "outro", nonce: "nonce" }, { sub: "pessoa", aud: "app" }, { sub: "outra", aud: "app", nonce: "nonce" }]) {
      await assert.rejects(validarTokensGovBr({ access_token, id_token: token(dados) }, cred, "nonce"));
    }
    await assert.rejects(validarTokensGovBr({ access_token, id_token: "invalido" }, cred, "nonce"));
    await assert.rejects(validarTokensGovBr({ access_token }, cred, "nonce"));
  });
});
