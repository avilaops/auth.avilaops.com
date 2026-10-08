import type { NextRequest } from "next/server";
import { tratarAvisoMeta } from "@/lib/avisoMeta";

export const runtime = "nodejs";

/**
 * "URL de retorno de chamada de desautorização" no painel da Meta:
 * `POST /api/meta/desautorizar`. A pessoa removeu o app no Facebook; o token
 * guardado já não vale e sai do banco junto com os ativos.
 */
export async function POST(req: NextRequest) {
  return tratarAvisoMeta(req, "desautorizacao");
}
