import { NextResponse, type NextRequest } from "next/server";
import { limitar } from "@/lib/rateLimit";
import { canalDoCliente, enviarVerificacao } from "@/lib/ssf";
import { corpoJson, erroSsf, exigirSsf, semCache } from "@/lib/ssfAcesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O receptor pede um evento de verificação para conferir o canal. Responder
 * 204 diz só que o pedido foi aceito; a prova é o evento chegar, com o `state`
 * que ele mandou.
 */
export async function POST(req: NextRequest) {
  const cliente = await exigirSsf(req, true);
  if (cliente instanceof NextResponse) return cliente;

  const c = ((await corpoJson(req)) ?? {}) as { stream_id?: unknown; state?: unknown };
  const canal = await canalDoCliente(cliente.id);
  if (!canal || c.stream_id !== canal.id) return erroSsf(404, "Canal não encontrado.");
  if (c.state !== undefined && (typeof c.state !== "string" || c.state.length > 1024)) return erroSsf(400, "`state` inválido.");
  if (!(await limitar(`ssf-verify:${canal.id}`, 30, 60 * 1000))) return semCache(NextResponse.json({ err: "too_many_requests", description: "Muitos pedidos de verificação." }, { status: 429 }));

  void enviarVerificacao(canal, typeof c.state === "string" ? c.state : undefined);
  return semCache(new NextResponse(null, { status: 204 }));
}
