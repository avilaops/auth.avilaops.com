import { NextResponse } from "next/server";
import { configuracaoSsf } from "@/lib/ssf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Descoberta do transmissor de sinais de segurança (OpenID SSF 1.0). */
export async function GET() {
  return NextResponse.json(configuracaoSsf(), { headers: { "Cache-Control": "public, max-age=300" } });
}
