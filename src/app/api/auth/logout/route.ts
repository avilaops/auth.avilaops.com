import { NextRequest, NextResponse } from "next/server";
import { returnToSeguro } from "@/lib/apps";
import { buscarApp } from "@/lib/cadastro";
import { registrar } from "@/lib/eventos";
import { lerSessao, limparCookieSessao } from "@/lib/sessao";
import { urlAbsoluta } from "@/lib/urls";

export const runtime = "nodejs";

/**
 * Logout global: apaga o cookie de `.avilaops.com`, então derruba a sessão em
 * todos os subdomínios de uma vez.
 *
 * POST porque logout é efeito colateral — em GET, um `<img src="/api/auth/logout">`
 * em qualquer página desloga o usuário sem que ele peça.
 */
export async function POST(req: NextRequest) {
  const sessao = await lerSessao();
  await limparCookieSessao();
  if (sessao) await registrar({ tipo: "logout", email: sessao.email });

  const app = await buscarApp(req.nextUrl.searchParams.get("app"));
  const destino = app
    ? returnToSeguro(req.nextUrl.searchParams.get("returnTo"), app)
    : urlAbsoluta("/login");

  return NextResponse.redirect(destino, { status: 303 });
}
