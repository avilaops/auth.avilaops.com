import { NextResponse } from 'next/server';
import { chaveDeAssinatura } from '@/lib/chaveOidc';
import { documentoDescoberta } from '@/lib/oidc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** RFC 8414: clientes MCP consultam este caminho no issuer central. */
export async function GET() {
  return NextResponse.json(documentoDescoberta((await chaveDeAssinatura()) !== null), {
    headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
  });
}
