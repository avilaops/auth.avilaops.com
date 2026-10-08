import { NextRequest, NextResponse } from "next/server";
import { destinoInicial } from "@/lib/admin";
import { returnToSeguro } from "@/lib/apps";
import { buscarApp } from "@/lib/cadastro";
import { gravarCookieDesafio } from "@/lib/desafio";
import { registrar } from "@/lib/eventos";
import { desafioNecessario } from "@/lib/segundoFator";
import { lerSessao } from "@/lib/sessao";
import { urlAbsoluta } from "@/lib/urls";

export const runtime = "nodejs";

/**
 * Elevação: a sessão existe, mas nasceu sem segundo fator, e o app pedido
 * exige um.
 *
 * Acontece com quem entrou antes de o 2FA existir (o cookie vale 8 horas) e
 * com quem entrou num app aberto e agora tenta um app que exige o fator.
 * Recusar seria grosseiro e inútil — a credencial está certa, só falta a
 * segunda metade. Então o `/login` manda para cá, o desafio é criado a partir
 * da sessão atual e a pessoa volta ao destino depois de provar.
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const sessao = await lerSessao();
  const q = req.nextUrl.searchParams;
  const appId = q.get("app");
  const returnTo = q.get("returnTo");

  if (!sessao) {
    const volta = `/login${appId ? `?app=${encodeURIComponent(appId)}` : ""}`;
    return NextResponse.redirect(urlAbsoluta(volta));
  }

  const app = await buscarApp(appId);
  const destino = app
    ? returnToSeguro(returnTo, app)
    : returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : destinoInicial(sessao);

  const motivo = await desafioNecessario({ email: sessao.email, papel: sessao.papel, app });
  if (motivo === "nenhum") {
    return NextResponse.redirect(destino.startsWith("/") ? urlAbsoluta(destino) : destino);
  }

  await gravarCookieDesafio({
    sub: sessao.sub,
    email: sessao.email,
    nome: sessao.nome,
    foto: sessao.foto,
    papel: sessao.papel,
    motivo,
    destino,
    appId: app?.id ?? null,
    via: "elevação de sessão",
    senhaProvisoria: false,
    deepLink: app?.deepLink ?? null,
  });
  await registrar({
    tipo: motivo === "cadastrar" ? "mfa_cadastro_exigido" : "mfa_desafiado",
    email: sessao.email,
    appId: app?.id ?? null,
    ip,
    detalhe: "elevação de sessão",
  });

  return NextResponse.redirect(urlAbsoluta(motivo === "cadastrar" ? "/mfa/cadastrar" : "/mfa"));
}
