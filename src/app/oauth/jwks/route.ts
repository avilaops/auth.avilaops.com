import { NextResponse } from "next/server";
import { chavesPublicas } from "@/lib/chaveOidc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Chaves públicas que conferem a assinatura do `id_token` (RS256).
 *
 * É o `jwks_uri` do documento de descoberta. Só a parte pública sai daqui.
 */
export async function GET() {
  return NextResponse.json({ keys: await chavesPublicas() }, { headers: { "Cache-Control": "public, max-age=300" } });
}
