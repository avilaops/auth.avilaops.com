import { NextRequest, NextResponse } from "next/server";
import { verificarAccessToken } from "@/lib/oidc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `userinfo_endpoint`: os claims do usuário, a partir do access token.
 *
 * O Outline exige `sub`, `email` e ao menos um entre `name` e
 * `preferred_username` — sem isso ele recusa o login com erro de perfil
 * incompleto. Mandamos os três.
 */
function claims(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "invalid_token" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer", "Cache-Control": "no-store" } },
    );
  }

  const id = verificarAccessToken(auth.slice(7).trim());
  if (!id) {
    return NextResponse.json(
      { error: "invalid_token" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer", "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      sub: id.sub,
      email: id.email,
      email_verified: true,
      name: id.nome,
      preferred_username: id.email,
      picture: id.foto ?? undefined,
      papel: id.papel,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(req: NextRequest) {
  return claims(req);
}

// O OIDC permite POST no userinfo; alguns clientes usam.
export async function POST(req: NextRequest) {
  return claims(req);
}
