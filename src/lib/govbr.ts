import { createPublicKey, type JsonWebKey } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Credenciais } from "@/lib/conectores";

export function baseGovBr(extras: Record<string, string>): string {
  if (extras.ambiente && !["staging", "producao"].includes(extras.ambiente)) throw new Error("gov.br: ambiente inválido");
  return `https://sso.${extras.ambiente === "staging" ? "staging." : ""}acesso.gov.br`;
}

/** Tokens nunca saem do Auth. O login não concede acesso a APIs de compras. */
export async function validarTokensGovBr(tokens: { access_token?: string; id_token?: string }, cred: Credenciais, nonce: string): Promise<jwt.JwtPayload> {
  if (!tokens.id_token || !tokens.access_token || !nonce) throw new Error("gov.br: tokens ou nonce ausentes");
  const base = baseGovBr(cred.extras);
  const r = await fetch(`${base}/jwk`, { signal: AbortSignal.timeout(10000), cache: "no-store", headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("gov.br: não foi possível validar a assinatura");
  const documento = await r.json() as { keys?: (JsonWebKey & { kid?: string; alg?: string; use?: string })[] };
  if (!Array.isArray(documento.keys)) throw new Error("gov.br: chaves inválidas");
  const verificar = (token: string, identidade: boolean): jwt.JwtPayload => {
    const cabecalho = jwt.decode(token, { complete: true })?.header;
    if (cabecalho?.alg !== "RS256" || !cabecalho.kid) throw new Error("gov.br: assinatura inválida");
    const jwk = documento.keys!.find(k => k.kid === cabecalho.kid && k.kty === "RSA" && (!k.use || k.use === "sig"));
    if (!jwk) throw new Error("gov.br: chave desconhecida");
    const payload = jwt.verify(token, createPublicKey({ key: jwk, format: "jwk" }), {
      algorithms: ["RS256"], issuer: [base, `${base}/`], ...(identidade ? { audience: cred.clientId } : {}),
    });
    if (typeof payload === "string" || !payload.sub || !payload.exp) throw new Error("gov.br: identidade incompleta");
    return payload;
  };
  const id = verificar(tokens.id_token, true), access = verificar(tokens.access_token, false);
  if (id.nonce !== nonce || id.sub !== access.sub) throw new Error("gov.br: identidade ou nonce divergente");
  return id;
}
