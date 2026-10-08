import { NextResponse } from "next/server";
import { COOKIE_FLUXO_META, appMeta, redirectUriMeta } from "@/lib/conexaoMeta";
import { VALIDADE_FLUXO_SEGUNDOS } from "@/lib/fluxo";
import { urlConexao } from "@/lib/meta";
import { gerarState } from "@/lib/oauth";
import { lerSessao } from "@/lib/sessao";
import { urlAbsoluta, urlErro } from "@/lib/urls";

export const runtime = "nodejs";

/**
 * Início da conexão de ativos da Meta: `GET /api/meta/conectar`.
 *
 * Só para quem já está logado — aqui ninguém entra, só autoriza. O cookie de
 * fluxo é outro, separado do login social, para um não atropelar o outro
 * quando a pessoa abre os dois em abas diferentes.
 */
export async function GET() {
  const sessao = await lerSessao();
  if (!sessao) return NextResponse.redirect(urlAbsoluta("/login?returnTo=/conta/meta"));

  const app = await appMeta();
  if (!app) return NextResponse.redirect(urlErro("meta_indisponivel"));

  const state = gerarState();
  const res = NextResponse.redirect(
    urlConexao({ clientId: app.clientId, redirectUri: redirectUriMeta(), state, escopos: app.escopos, configId: app.configId }),
  );
  res.cookies.set(COOKIE_FLUXO_META, JSON.stringify({ state, conta: sessao.sub }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VALIDADE_FLUXO_SEGUNDOS,
  });
  return res;
}
