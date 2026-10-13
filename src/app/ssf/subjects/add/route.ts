import { NextResponse, type NextRequest } from "next/server";
import { canalDoCliente } from "@/lib/ssf";
import { corpoJson, erroSsf, exigirSsf, semCache } from "@/lib/ssfAcesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Este transmissor envia os eventos de todas as contas (`default_subjects:
 * ALL`), então não guarda lista de sujeitos por canal. O pedido é aceito para
 * o receptor que o faz por rotina, e não muda o que é enviado.
 */
export async function POST(req: NextRequest) {
  const cliente = await exigirSsf(req, true);
  if (cliente instanceof NextResponse) return cliente;

  const c = ((await corpoJson(req)) ?? {}) as { stream_id?: unknown; subject?: unknown };
  const canal = await canalDoCliente(cliente.id);
  if (!canal || c.stream_id !== canal.id) return erroSsf(404, "Canal não encontrado.");
  if (typeof c.subject !== "object" || c.subject === null) return erroSsf(400, "`subject` ausente.");
  return semCache(new NextResponse(null, { status: 200 }));
}
