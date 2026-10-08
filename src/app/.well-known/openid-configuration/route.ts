import { NextResponse } from "next/server";
import { documentoDescoberta } from "@/lib/oidc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Descoberta OIDC.
 *
 * Nenhum cliente nosso depende dela hoje — o Outline recebe os três endpoints
 * escritos no `.env`, que é mais previsível. Fica publicada porque é o que
 * transforma "temos três rotas" em "somos um provedor": a próxima ferramenta
 * de prateleira aponta o `issuer` e acha o resto sozinha.
 */
export async function GET() {
  return NextResponse.json(documentoDescoberta(), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
