import { NextRequest, NextResponse } from "next/server";
import { appMeta, entregarConexao } from "@/lib/conexaoMeta";
import { registrar } from "@/lib/eventos";
import { autenticarCliente } from "@/lib/oidc";
import { limitar } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resposta(corpo: unknown, status = 200) {
  return NextResponse.json(corpo, { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}

/**
 * `GET /api/meta/ativos?email=<e-mail da conta>` — a conexão da Meta de um
 * cliente, com os tokens, para um sistema da casa trabalhar (atendimento,
 * loja, anúncios).
 *
 * Quem chama se identifica com `Authorization: Basic <client_id:client_secret>`
 * de uma integração cadastrada em `/admin/integracoes` **com a permissão de
 * ler a Meta**. Login por OIDC sozinho não dá esse acesso.
 *
 * Respostas: 200 com a conexão; 404 se a conta não conectou; 409 se a conexão
 * venceu (o cliente precisa conectar de novo em `/conta/meta`).
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  if (!(await limitar(`meta-ativos:${ip}`, 300, 15 * 60 * 1000))) {
    return resposta({ error: "Muitas chamadas. Tente novamente em alguns minutos." }, 429);
  }

  const cliente = await autenticarCliente(req.headers.get("authorization"));
  if (!cliente) return resposta({ error: "Cliente ou segredo inválidos." }, 401);
  if (!cliente.acessoMeta) return resposta({ error: "Esta integração não tem permissão para ler conexões da Meta." }, 403);

  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email || !email.includes("@")) return resposta({ error: "Informe `email`." }, 400);

  const app = await appMeta();
  if (!app) return resposta({ error: "Conexão com a Meta não configurada no auth." }, 503);

  const c = await entregarConexao(email, app);
  if (!c) return resposta({ error: "Esta conta não conectou a Meta." }, 404);
  if (c === "vencida") {
    return resposta({ error: "A conexão venceu. O cliente precisa conectar de novo.", reconectar: "https://auth.avilaops.com/conta/meta" }, 409);
  }

  await registrar({ tipo: "meta_token_entregue", email: c.email, appId: cliente.appId, ip, detalhe: `${c.ativos.length} ativos`, autor: cliente.id });
  if (c.renovado) await registrar({ tipo: "meta_token_renovado", email: c.email, appId: cliente.appId, autor: cliente.id });

  return resposta({
    conta: { id: c.contaId, email: c.email },
    meta: { usuarioId: c.fbUserId, nome: c.nome, escopos: c.escopos, expiraEm: c.expiraEm?.toISOString() ?? null },
    token: c.token,
    ativos: c.ativos,
  });
}
