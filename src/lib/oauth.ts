import { createHash, randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import { decifrar } from "@/lib/cripto";
import type { Credenciais } from "@/lib/conectores";
import { resolverUrl, type PerfilExterno, type Provedor } from "@/lib/provedores";

/**
 * Motor OAuth 2.0 / OIDC genérico. O que é específico de cada provedor mora em
 * `provedores.ts`; aqui é só o protocolo: authorize → code → token → perfil.
 */

export function gerarState(): string {
  return randomBytes(16).toString("hex");
}

export function gerarVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function challenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function urlAutorizacao(
  p: Provedor,
  cred: Credenciais,
  opts: { redirectUri: string; state: string; nonce: string; verifier?: string },
): string {
  const url = new URL(resolverUrl(p.authorizeUrl, cred.extras));
  url.searchParams.set("client_id", cred.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", p.escopos.join(" "));
  url.searchParams.set("state", opts.state);
  if (p.escopos.includes("openid")) url.searchParams.set("nonce", opts.nonce);
  if (p.pkce && opts.verifier) {
    url.searchParams.set("code_challenge", challenge(opts.verifier));
    url.searchParams.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(p.parametrosAuthorize ?? {})) url.searchParams.set(k, v);
  return url.toString();
}

/**
 * Apple não tem client secret fixo: é um JWT ES256 assinado com a chave .p8,
 * válido por até 6 meses. Geramos um por login — barato e nunca expira na mão.
 */
function secretApple(cred: Credenciais): string {
  const { teamId, keyId, privateKey } = cred.extras;
  if (!teamId || !keyId || !privateKey) throw new Error("Apple: teamId, keyId e chave privada são obrigatórios");
  return jwt.sign({}, decifrar(privateKey), {
    algorithm: "ES256",
    keyid: keyId,
    issuer: teamId,
    audience: "https://appleid.apple.com",
    subject: cred.clientId,
    expiresIn: "5m",
  });
}

type RespostaToken = { access_token?: string; id_token?: string; error?: string; error_description?: string };

export async function trocarCodigo(
  p: Provedor,
  cred: Credenciais,
  opts: { code: string; redirectUri: string; verifier?: string },
): Promise<RespostaToken> {
  const secret = p.id === "apple" ? secretApple(cred) : cred.clientSecret;
  if (!secret) throw new Error("client secret ausente");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: cred.clientId,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (p.authNoHeader === false) {
    // gov.br exige Basic auth no token endpoint.
    headers.Authorization = `Basic ${Buffer.from(`${cred.clientId}:${secret}`).toString("base64")}`;
  } else {
    body.set("client_secret", secret);
  }
  if (p.pkce && opts.verifier) body.set("code_verifier", opts.verifier);

  const r = await fetch(resolverUrl(p.tokenUrl, cred.extras), { method: "POST", headers, body });
  const dados = (await r.json().catch(() => ({}))) as RespostaToken;
  if (!r.ok || dados.error) {
    throw new Error(`${p.nome}: ${dados.error_description || dados.error || `HTTP ${r.status}`}`);
  }
  return dados;
}

/**
 * Lê o payload do id_token sem validar assinatura.
 *
 * Aceitável aqui porque o token veio direto do endpoint de token do provedor
 * por HTTPS, numa conexão iniciada por nós, autenticada com o client secret —
 * não passou pelo navegador. O `nonce` ainda é conferido.
 */
function payloadIdToken(idToken: string): Record<string, unknown> {
  const partes = idToken.split(".");
  if (partes.length < 2) throw new Error("id_token malformado");
  return JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8")) as Record<string, unknown>;
}

export async function obterPerfil(
  p: Provedor,
  tokens: RespostaToken,
  nonce: string,
  extraDoCallback?: Record<string, unknown>,
): Promise<PerfilExterno> {
  let dados: Record<string, unknown> = {};

  if (p.perfilNoIdToken || (!p.userinfoUrl && tokens.id_token)) {
    if (!tokens.id_token) throw new Error("id_token ausente");
    dados = payloadIdToken(tokens.id_token);
    if (dados.nonce && dados.nonce !== nonce) throw new Error("nonce não confere");
  } else {
    if (!p.userinfoUrl || !tokens.access_token) throw new Error("sem meio de obter o perfil");
    const r = await fetch(p.userinfoUrl, {
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json", "User-Agent": "auth.avilaops.com" },
    });
    if (!r.ok) throw new Error(`${p.nome}: userinfo HTTP ${r.status}`);
    dados = (await r.json()) as Record<string, unknown>;
    if (tokens.id_token) {
      // Se veio id_token também, confere o nonce nele.
      try {
        const pl = payloadIdToken(tokens.id_token);
        if (pl.nonce && pl.nonce !== nonce) throw new Error("nonce não confere");
      } catch (e) {
        if (e instanceof Error && e.message === "nonce não confere") throw e;
      }
    }
  }

  // Apple manda o nome só na primeira autorização, fora do token, como JSON no
  // campo `user` do form_post.
  if (extraDoCallback?.user && typeof extraDoCallback.user === "string") {
    try {
      const u = JSON.parse(extraDoCallback.user) as { name?: { firstName?: string; lastName?: string } };
      const nome = [u.name?.firstName, u.name?.lastName].filter(Boolean).join(" ");
      if (nome) dados.name = nome;
    } catch {
      /* ignora */
    }
  }

  const perfil = await p.perfil(dados, tokens.access_token ?? "");
  if (!perfil.id) throw new Error(`${p.nome}: perfil sem id`);
  return perfil;
}
