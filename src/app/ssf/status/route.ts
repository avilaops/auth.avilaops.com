import { NextResponse, type NextRequest } from "next/server";
import { registrar } from "@/lib/eventos";
import { canalDoCliente, mudarStatusDoCanal, STATUS_DO_CANAL, type StatusDoCanal } from "@/lib/ssf";
import { corpoJson, erroSsf, exigirSsf, semCache } from "@/lib/ssfAcesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resposta(c: { id: string; status: string; motivo: string | null }) {
  return semCache(NextResponse.json({ stream_id: c.id, status: c.status, ...(c.motivo ? { reason: c.motivo } : {}) }));
}

/** Situação do canal: `enabled`, `paused` ou `disabled`. Pausado ou desligado, nada é enviado nem guardado. */
export async function GET(req: NextRequest) {
  const cliente = await exigirSsf(req, false);
  if (cliente instanceof NextResponse) return cliente;

  const canal = await canalDoCliente(cliente.id);
  const pedido = req.nextUrl.searchParams.get("stream_id");
  if (!canal || (pedido && canal.id !== pedido)) return erroSsf(404, "Canal não encontrado.");
  return resposta(canal);
}

export async function POST(req: NextRequest) {
  const cliente = await exigirSsf(req, true);
  if (cliente instanceof NextResponse) return cliente;

  const c = ((await corpoJson(req)) ?? {}) as { stream_id?: unknown; status?: unknown; reason?: unknown };
  const canal = await canalDoCliente(cliente.id);
  if (!canal || c.stream_id !== canal.id) return erroSsf(404, "Canal não encontrado.");
  if (typeof c.status !== "string" || !(STATUS_DO_CANAL as readonly string[]).includes(c.status)) return erroSsf(400, "`status` precisa ser enabled, paused ou disabled.");

  const novo = await mudarStatusDoCanal(canal.id, c.status as StatusDoCanal, typeof c.reason === "string" ? c.reason.slice(0, 300) : null);
  await registrar({ tipo: "ssf_canal_alterado", appId: cliente.appId, autor: `app:${cliente.id}`, detalhe: `${cliente.id}: situação ${canal.status} → ${novo.status}` });
  return resposta(novo);
}
