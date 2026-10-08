import { NextRequest, NextResponse } from "next/server";
import { returnToSeguro } from "@/lib/apps";
import { buscarApp } from "@/lib/cadastro";
import { credenciais, redirectUri } from "@/lib/conectores";
import { COOKIE_FLUXO, VALIDADE_FLUXO_SEGUNDOS, type EstadoFluxo } from "@/lib/fluxo";
import { gerarState, gerarVerifier, urlAutorizacao } from "@/lib/oauth";
import { buscarProvedor } from "@/lib/provedores";
import { lerSessao } from "@/lib/sessao";
import { urlErro } from "@/lib/urls";

export const runtime = "nodejs";

/**
 * Início do login social: `GET /api/auth/{provedor}?app=&returnTo=[&vincular=1]`.
 *
 * Grava state/nonce/PKCE num cookie e manda o navegador ao provedor. Com
 * `vincular=1` e sessão ativa, o callback liga o provedor à conta logada em
 * vez de fazer login.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provedor: string }> }) {
  const { provedor: id } = await ctx.params;
  const p = buscarProvedor(id);
  if (!p) return NextResponse.redirect(urlErro("provedor_desconhecido"));

  const cred = await credenciais(p.id);
  if (!cred) return NextResponse.redirect(urlErro("provedor_desligado"));

  const q = req.nextUrl.searchParams;
  const app = await buscarApp(q.get("app"));
  const returnToBruto = q.get("returnTo");
  let returnTo = "";
  if (app) returnTo = returnToSeguro(returnToBruto, app);
  else if (returnToBruto && returnToBruto.startsWith("/") && !returnToBruto.startsWith("//")) returnTo = returnToBruto;

  let vincularConta = "";
  if (q.get("vincular") === "1") {
    const sessao = await lerSessao();
    if (!sessao) return NextResponse.redirect(urlErro("sessao_necessaria"));
    vincularConta = sessao.sub;
    if (!returnTo) returnTo = "/conta";
  }

  const estado: EstadoFluxo = {
    state: gerarState(),
    nonce: gerarState(),
    provedor: p.id,
    verifier: p.pkce ? gerarVerifier() : "",
    appId: app?.id ?? "",
    returnTo,
    vincularConta,
  };

  const destino = urlAutorizacao(p, cred, {
    redirectUri: redirectUri(p.id),
    state: estado.state,
    nonce: estado.nonce,
    verifier: estado.verifier || undefined,
  });

  const res = NextResponse.redirect(destino);
  res.cookies.set(COOKIE_FLUXO, JSON.stringify(estado), {
    httpOnly: true,
    // Apple devolve por POST cross-site (form_post): com Lax o cookie não
    // viaja e o callback não acha o estado. None exige Secure.
    sameSite: p.formPost ? "none" : "lax",
    secure: process.env.NODE_ENV === "production" || p.formPost === true,
    path: "/",
    maxAge: VALIDADE_FLUXO_SEGUNDOS,
  });
  return res;
}
