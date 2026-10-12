import { after, NextRequest, NextResponse } from "next/server";
import { returnToSeguro } from "@/lib/apps";
import { buscarApp } from "@/lib/cadastro";
import { avisarLogout } from "@/lib/avisoDeLogout";
import { registrar } from "@/lib/eventos";
import { revogarRefreshDaConta } from "@/lib/refreshOAuth";
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
  if (sessao) {
    // Sair vale para os sistemas que entram por OIDC também: sem isto, o
    // refresh token deles renovaria a sessão de quem acabou de sair.
    await revogarRefreshDaConta(sessao.sub);
    // Depois de responder: a pessoa não espera os outros sistemas para sair.
    const sub = sessao.sub;
    after(() => avisarLogout(sub));
    await registrar({ tipo: "logout", email: sessao.email });
  }

  const app = await buscarApp(req.nextUrl.searchParams.get("app"));
  const destino = app
    ? returnToSeguro(req.nextUrl.searchParams.get("returnTo"), app)
    : urlAbsoluta("/login");

  return NextResponse.redirect(destino, { status: 303 });
}
