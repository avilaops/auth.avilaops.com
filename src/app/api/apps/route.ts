import { NextRequest, NextResponse } from "next/server";
import { listarCadastro } from "@/lib/cadastro";
import { comCors, origemPermitida } from "@/lib/cors";
import { menuDeApps } from "@/lib/menuDeApps";
import { listarPermissoes } from "@/lib/permissoes";
import { lerSessao } from "@/lib/sessao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O menu de apps da sessão corrente: `{ conta, apps: [{ id, nome, url }] }`.
 *
 * Serve ao menu compartilhado do ecossistema. Sistema que desenha o menu no
 * servidor (o CMS não roda script no painel) chama repassando o cookie
 * `avila_sso`; sistema que desenha no navegador chama com `credentials:
 * "include"`, e o CORS aceita só `*.avilaops.com`. Sem sessão responde 401,
 * como `/api/session`.
 */
export async function GET(req: NextRequest) {
  const origem = origemPermitida(req.headers.get("origin"));
  const sessao = await lerSessao();
  if (!sessao) return comCors(NextResponse.json({ autenticado: false }, { status: 401 }), origem);

  const [cadastro, liberados] = await Promise.all([listarCadastro(), listarPermissoes(sessao.email)]);
  const res = NextResponse.json({ autenticado: true, ...menuDeApps(cadastro, sessao.papel, liberados) });
  // A lista muda quando a equipe libera ou revoga um acesso: não guardar.
  res.headers.set("Cache-Control", "no-store");
  return comCors(res, origem);
}

export async function OPTIONS(req: NextRequest) {
  const origem = origemPermitida(req.headers.get("origin"));
  const res = new NextResponse(null, { status: 204 });
  if (origem) res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return comCors(res, origem);
}
