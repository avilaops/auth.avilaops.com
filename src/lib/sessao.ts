import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import type { Papel } from "@/lib/apps";

/**
 * Cookie de sessão do SSO.
 *
 * Gravado em `.avilaops.com` (com o ponto) para o navegador mandá-lo a todos os
 * subdomínios — é isso que faz quem logou no CRM já chegar logado no ERP.
 */
const COOKIE_SESSAO = "avila_sso";
const TTL_SEGUNDOS = 8 * 60 * 60;

export type Sessao = {
  sub: string;
  email: string;
  nome: string;
  foto: string | null;
  papel: Papel;
  /**
   * Segundo fator conferido nesta sessão.
   *
   * Campo novo e opcional de propósito: token emitido antes do 2FA existir
   * continua válido até expirar, e app consumidor que não conhece o campo não
   * quebra. Quem exige o fator (`apps.ts`, `exigeSegundoFator`) trata ausente
   * como "não conferido" e manda elevar em `/login`.
   */
  mfa?: boolean;
};

function segredo(): string {
  const s = process.env.SSO_JWT_SECRET;
  if (!s) throw new Error("SSO_JWT_SECRET não configurado");
  return s;
}

function dominioCookie(): string | undefined {
  // Em dev (localhost) não existe domínio pai para compartilhar: deixar
  // indefinido, senão o navegador recusa o cookie e o login "não faz nada".
  return process.env.SSO_COOKIE_DOMAIN || undefined;
}

export function assinarSessao(s: Sessao): string {
  return jwt.sign(s, segredo(), {
    expiresIn: TTL_SEGUNDOS,
    issuer: "auth.avilaops.com",
  });
}

export function verificarSessao(token: string): Sessao | null {
  try {
    return jwt.verify(token, segredo(), { issuer: "auth.avilaops.com" }) as Sessao;
  } catch {
    return null;
  }
}

export async function gravarCookieSessao(s: Sessao) {
  const store = await cookies();
  store.set(COOKIE_SESSAO, assinarSessao(s), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    domain: dominioCookie(),
    maxAge: TTL_SEGUNDOS,
  });
}

export async function limparCookieSessao() {
  const store = await cookies();
  // O `domain` precisa ser o mesmo da escrita: um cookie de `.avilaops.com` não é
  // apagado por um delete host-only, e o logout deixaria a sessão viva.
  store.delete({ name: COOKIE_SESSAO, path: "/", domain: dominioCookie() });
}

export async function lerSessao(): Promise<Sessao | null> {
  const store = await cookies();
  const token = store.get(COOKIE_SESSAO)?.value;
  if (!token) return null;
  return verificarSessao(token);
}

export const NOME_COOKIE_SESSAO = COOKIE_SESSAO;
