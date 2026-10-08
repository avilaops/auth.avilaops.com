import { NextRequest, NextResponse } from "next/server";
import { buscarApp } from "@/lib/cadastro";
import { podeEntrar } from "@/lib/permissoes";
import { lerSessao } from "@/lib/sessao";

export const runtime = "nodejs";

/**
 * Sessão corrente, para quem não consegue validar o JWT localmente
 * (front estático, serviço em outra linguagem).
 *
 * Quem roda Node e tem o `SSO_JWT_SECRET` deve verificar o cookie direto, sem
 * pagar um round-trip por request.
 *
 * Com `?app=<id>` a resposta traz também `permitido`: se esta conta pode
 * entrar naquele app, pela mesma regra do login (`podeEntrar`). O cookie vale
 * em todo `*.avilaops.com`, então ter sessão não diz nada sobre um app
 * restrito — quem logou em outro sistema chega com o cookie do mesmo jeito. É
 * por aqui que o app pergunta, em vez de reimplementar a regra.
 */

function origemPermitida(origin: string | null): string | null {
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

function comCors(res: NextResponse, origem: string | null) {
  if (origem) {
    res.headers.set("Access-Control-Allow-Origin", origem);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Vary", "Origin");
  }
  return res;
}

export async function GET(req: NextRequest) {
  const origem = origemPermitida(req.headers.get("origin"));
  const sessao = await lerSessao();

  if (!sessao) {
    return comCors(NextResponse.json({ autenticado: false }, { status: 401 }), origem);
  }

  const appId = req.nextUrl.searchParams.get("app");
  if (!appId) return comCors(NextResponse.json({ autenticado: true, sessao }), origem);

  // App fora do cadastro, sem login único ou desativado: ninguém é permitido.
  const app = await buscarApp(appId);
  const permitido = app ? await podeEntrar(sessao.email, sessao.papel, app) : false;
  return comCors(NextResponse.json({ autenticado: true, sessao, permitido }), origem);
}

export async function OPTIONS(req: NextRequest) {
  const origem = origemPermitida(req.headers.get("origin"));
  const res = new NextResponse(null, { status: 204 });
  if (origem) res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return comCors(res, origem);
}
