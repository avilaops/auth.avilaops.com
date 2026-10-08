import { NextRequest, NextResponse } from "next/server";
import {
  assinarAccessToken,
  assinarIdToken,
  autenticarCliente,
  redirectUriValido,
  resgatarCodigoOAuth,
  TTL_TOKEN_SEGUNDOS,
  type ClienteOIDC,
} from "@/lib/oidc";
import { limitar } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function erro(code: string, descricao: string, status = 400) {
  return NextResponse.json(
    { error: code, error_description: descricao },
    { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

/** `token_endpoint`: troca o código de uso único pelos tokens. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  if (!(await limitar(`oauth-token:${ip}`, 60, 15 * 60 * 1000))) {
    return erro("invalid_request", "Muitas tentativas. Tente novamente em alguns minutos.", 429);
  }

  let corpo: URLSearchParams;
  try {
    corpo = new URLSearchParams(await req.text());
  } catch {
    return erro("invalid_request", "Corpo inválido.");
  }

  if (corpo.get("grant_type") !== "authorization_code") {
    return erro("unsupported_grant_type", "Só `authorization_code` é aceito.");
  }

  const cliente: ClienteOIDC | null = await autenticarCliente(req.headers.get("authorization"), corpo);
  // Cliente inexistente e segredo errado devolvem a mesma resposta: distinguir
  // os casos diria a quem sonda quais `client_id` existem.
  if (!cliente) {
    return erro("invalid_client", "Cliente ou segredo inválidos.", 401);
  }

  const codigo = corpo.get("code");
  const redirectUri = corpo.get("redirect_uri");
  if (!codigo) return erro("invalid_request", "`code` ausente.");
  if (!redirectUriValido(cliente, redirectUri)) {
    return erro("invalid_grant", "`redirect_uri` não confere.");
  }

  const resgate = await resgatarCodigoOAuth(
    codigo,
    cliente.id,
    redirectUri as string,
    corpo.get("code_verifier"),
  );
  // Código inexistente, expirado, já usado, de outro cliente ou com PKCE
  // errado: uma resposta só, pelo mesmo motivo de sempre — não servir de
  // oráculo para quem estiver sondando.
  if (!resgate) return erro("invalid_grant", "Código inválido ou expirado.");

  const identidade = {
    sub: resgate.sub,
    email: resgate.email,
    nome: resgate.nome,
    foto: resgate.foto,
    papel: resgate.papel,
  };

  return NextResponse.json(
    {
      access_token: assinarAccessToken(identidade, cliente.id),
      id_token: assinarIdToken(identidade, cliente.id, resgate.nonce),
      token_type: "Bearer",
      expires_in: TTL_TOKEN_SEGUNDOS,
      scope: "openid profile email",
    },
    { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}
