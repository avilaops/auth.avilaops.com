import type { NextResponse } from "next/server";

/**
 * CORS das rotas que os outros sistemas da casa chamam do navegador, com o
 * cookie da sessão: só origem `https` de `avilaops.com` ou de um subdomínio.
 */
export function origemPermitida(origin: string | null): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return null;
    // Igualdade no sufixo com o ponto: `.avilaops.com` não casa com
    // `evil-avilaops.com`, que um `endsWith("avilaops.com")` deixaria passar.
    if (url.host === "avilaops.com" || url.host.endsWith(".avilaops.com")) {
      return url.origin;
    }
  } catch {
    /* origem malformada */
  }
  return null;
}

export function comCors<T extends NextResponse>(res: T, origem: string | null): T {
  if (origem) {
    res.headers.set("Access-Control-Allow-Origin", origem);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Vary", "Origin");
  }
  return res;
}
