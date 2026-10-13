import { NextResponse, type NextRequest } from "next/server";
import { buscarCliente, ESCOPO_SSF_GERIR, ESCOPO_SSF_LER, verificarAccessToken, type ClienteOIDC } from "@/lib/oidc";

/**
 * Quem está chamando a API do canal de sinais.
 *
 * O receptor se apresenta com o access token do login (Bearer). Três coisas
 * precisam bater: o token vale, ele carrega o escopo pedido, e a integração
 * dona dele continua ativa e marcada para SSF. A última é conferida a cada
 * chamada: desmarcar no painel fecha a API na hora, sem esperar o token vencer.
 */
export function erroSsf(status: number, descricao: string): NextResponse {
  return NextResponse.json({ err: status === 401 ? "authentication_failed" : status === 403 ? "access_denied" : "invalid_request", description: descricao }, { status, headers: { "Cache-Control": "no-store", ...(status === 401 ? { "WWW-Authenticate": "Bearer" } : {}) } });
}

export async function exigirSsf(req: NextRequest, paraGerir: boolean): Promise<ClienteOIDC | NextResponse> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? verificarAccessToken(auth.slice(7).trim()) : null;
  if (!token) return erroSsf(401, "Access token ausente ou inválido.");

  // Quem gere também lê.
  const tem = (e: string) => token.escopos.includes(e);
  if (paraGerir ? !tem(ESCOPO_SSF_GERIR) : !tem(ESCOPO_SSF_GERIR) && !tem(ESCOPO_SSF_LER)) return erroSsf(403, "O token não tem o escopo necessário.");

  const cliente = await buscarCliente(token.aud);
  if (!cliente || !cliente.ssf) return erroSsf(403, "Esta integração não está autorizada a receber sinais.");
  return cliente;
}

/** Corpo JSON da requisição, ou `null` quando não é JSON. */
export async function corpoJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export function semCache<T extends NextResponse>(res: T): T {
  res.headers.set("Cache-Control", "no-store");
  return res;
}
