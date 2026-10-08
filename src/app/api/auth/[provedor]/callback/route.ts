import { NextRequest, NextResponse } from "next/server";
import { returnToSeguro } from "@/lib/apps";
import { buscarApp } from "@/lib/cadastro";
import { credenciais, redirectUri } from "@/lib/conectores";
import { papelDaRole } from "@/lib/contas";
import { registrar } from "@/lib/eventos";
import { COOKIE_FLUXO, lerEstadoFluxo } from "@/lib/fluxo";
import { obterPerfil, trocarCodigo } from "@/lib/oauth";
import { podeEntrar } from "@/lib/permissoes";
import { buscarProvedor } from "@/lib/provedores";
import { destinoInicial } from "@/lib/admin";
import { entrar } from "@/lib/entrada";
import { urlAbsoluta, urlErro } from "@/lib/urls";
import { resolverLogin, vincularNaSessao } from "@/lib/vinculos";

export const runtime = "nodejs";

/**
 * Volta do provedor. GET para todos; POST para Apple (form_post).
 *
 * É a única URL registrada em cada console: `/api/auth/{provedor}/callback`.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provedor: string }> }) {
  const q = req.nextUrl.searchParams;
  return tratar(req, ctx, Object.fromEntries(q.entries()));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ provedor: string }> }) {
  const form = await req.formData();
  const dados: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") dados[k] = v;
  return tratar(req, ctx, dados);
}

async function tratar(req: NextRequest, ctx: { params: Promise<{ provedor: string }> }, dados: Record<string, string>) {
  const { provedor: id } = await ctx.params;
  const p = buscarProvedor(id);
  if (!p) return limpar(NextResponse.redirect(urlErro("provedor_desconhecido")));

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const estado = lerEstadoFluxo(req.cookies.get(COOKIE_FLUXO)?.value);
  if (!estado || estado.provedor !== p.id) return limpar(NextResponse.redirect(urlErro("fluxo_expirado")));
  if (!dados.state || dados.state !== estado.state) return limpar(NextResponse.redirect(urlErro("state_invalido")));

  if (dados.error) {
    const motivo = dados.error === "access_denied" || dados.error === "user_cancelled_authorize" ? "cancelado" : "falha_provedor";
    return limpar(NextResponse.redirect(urlErro(motivo)));
  }
  if (!dados.code) return limpar(NextResponse.redirect(urlErro("sem_codigo")));

  const cred = await credenciais(p.id);
  if (!cred) return limpar(NextResponse.redirect(urlErro("provedor_desligado")));

  let perfil;
  try {
    const tokens = await trocarCodigo(p, cred, { code: dados.code, redirectUri: redirectUri(p.id), verifier: estado.verifier || undefined });
    perfil = await obterPerfil(p, tokens, estado.nonce, dados);
  } catch (e) {
    console.error(`[${p.id}] callback`, e);
    await registrar({ tipo: "login_falhou", ip, detalhe: `${p.id}: ${e instanceof Error ? e.message : String(e)}` });
    return limpar(NextResponse.redirect(urlErro("falha_provedor")));
  }

  // Vincular à conta logada.
  if (estado.vincularConta) {
    const r = await vincularNaSessao(p.id, perfil, estado.vincularConta, ip);
    const destino = r === "ok" ? (estado.returnTo || "/conta") : `/conta?erro=ja_usado&provedor=${p.id}`;
    return limpar(NextResponse.redirect(urlAbsoluta(destino)));
  }

  // Login.
  const r = await resolverLogin(p.id, perfil, ip);
  if (!r.ok) {
    await registrar({ tipo: "login_falhou", email: perfil.email, ip, detalhe: `${p.id}: ${r.motivo}` });
    return limpar(NextResponse.redirect(urlErro(r.motivo)));
  }

  const conta = r.conta;
  const papel = papelDaRole(conta.role);
  const app = await buscarApp(estado.appId || null);

  if (app && !(await podeEntrar(conta.email, papel, app))) {
    await registrar({ tipo: "login_sem_permissao", email: conta.email, appId: app.id, ip, detalhe: p.id });
    return limpar(NextResponse.redirect(urlErro("sem_permissao")));
  }

  let destino: string;
  if (app) destino = returnToSeguro(estado.returnTo, app);
  else if (estado.returnTo) destino = urlAbsoluta(estado.returnTo);
  else destino = urlAbsoluta(destinoInicial({ email: conta.email, papel }));

  // Mesma porta do login por senha: o provedor externo provou a identidade,
  // não a posse do segundo fator. App nativo continua saindo por código de uso
  // único no deep link — isso vive dentro do `entrar`.
  const entrada = await entrar(
    {
      sub: conta.id,
      email: conta.email,
      nome: conta.nome,
      foto: perfil.foto,
      papel,
      destino,
      app,
      senhaProvisoria: false,
      via: `via ${p.id}${r.novo === "conta" ? " (conta nova)" : r.novo === "vinculo" ? " (vinculado)" : ""}`,
    },
    ip,
  );

  return limpar(NextResponse.redirect(entrada.tipo === "desafio" ? urlAbsoluta(entrada.destino) : entrada.destino));
}

function limpar(res: NextResponse): NextResponse {
  res.cookies.set(COOKIE_FLUXO, "", { path: "/", maxAge: 0 });
  return res;
}
