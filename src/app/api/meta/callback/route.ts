import { NextRequest, NextResponse } from "next/server";
import { COOKIE_FLUXO_META, appMeta, conectar, redirectUriMeta } from "@/lib/conexaoMeta";
import { registrar } from "@/lib/eventos";
import { trocarCodigoMeta } from "@/lib/meta";
import { lerSessao } from "@/lib/sessao";
import { urlAbsoluta, urlErro } from "@/lib/urls";

export const runtime = "nodejs";

function lerFluxo(bruto: string | undefined): { state: string; conta: string } | null {
  if (!bruto) return null;
  try {
    const v = JSON.parse(bruto) as { state?: unknown; conta?: unknown };
    return typeof v.state === "string" && typeof v.conta === "string" ? { state: v.state, conta: v.conta } : null;
  } catch {
    return null;
  }
}

/**
 * Volta da Meta depois da autorização: `GET /api/meta/callback`.
 *
 * A sessão é conferida de novo e precisa ser da mesma conta que começou o
 * fluxo. Sem isso, quem trocasse de conta no meio gravaria as Páginas de uma
 * pessoa no cadastro de outra.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const fluxo = lerFluxo(req.cookies.get(COOKIE_FLUXO_META)?.value);
  if (!fluxo) return limpar(NextResponse.redirect(urlErro("fluxo_expirado")));
  if (q.get("state") !== fluxo.state) return limpar(NextResponse.redirect(urlErro("state_invalido")));

  const sessao = await lerSessao();
  if (!sessao || sessao.sub !== fluxo.conta) return limpar(NextResponse.redirect(urlErro("sessao_necessaria")));

  if (q.get("error")) return limpar(NextResponse.redirect(urlAbsoluta("/conta/meta?aviso=cancelado")));
  const code = q.get("code");
  if (!code) return limpar(NextResponse.redirect(urlErro("sem_codigo")));

  const app = await appMeta();
  if (!app) return limpar(NextResponse.redirect(urlErro("meta_indisponivel")));

  try {
    const token = await trocarCodigoMeta({
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      redirectUri: redirectUriMeta(),
      code,
    });
    const r = await conectar({ id: sessao.sub, email: sessao.email }, app, token);
    await registrar({ tipo: "meta_conectada", email: sessao.email, ip, detalhe: `${r.ativos} ativos`, autor: sessao.email });
  } catch (e) {
    console.error("[meta] callback", e);
    await registrar({ tipo: "meta_falhou", email: sessao.email, ip, detalhe: e instanceof Error ? e.message : String(e) });
    return limpar(NextResponse.redirect(urlAbsoluta("/conta/meta?aviso=falhou")));
  }

  return limpar(NextResponse.redirect(urlAbsoluta("/conta/meta?aviso=conectado")));
}

function limpar(res: NextResponse): NextResponse {
  res.cookies.set(COOKIE_FLUXO_META, "", { path: "/", maxAge: 0 });
  return res;
}
