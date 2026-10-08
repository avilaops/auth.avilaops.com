import type { NextRequest } from "next/server";
import { tratarAvisoMeta } from "@/lib/avisoMeta";

export const runtime = "nodejs";

/**
 * "URL de retorno de chamada de exclusão de dados" no painel da Meta:
 * `POST /api/meta/exclusao`. Apaga a conexão de ativos e o vínculo de login
 * com Facebook de quem pediu, e devolve o endereço do comprovante.
 */
export async function POST(req: NextRequest) {
  return tratarAvisoMeta(req, "exclusao");
}
