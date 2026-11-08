import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { autenticarCliente, verificarAccessToken } from '@/lib/oidc';
import { revogarFamilia } from '@/lib/refreshOAuth';
import { prisma } from '@/lib/prisma';
import { limitar } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const corpo = new URLSearchParams(await req.text());
  const cliente = await autenticarCliente(req.headers.get('authorization'), corpo);
  const headers = { 'Cache-Control': 'no-store' };
  if (!cliente || cliente.appId !== 'mcp') return NextResponse.json({ error: 'invalid_client' }, { status: 401, headers });
  if (!(await limitar(`mcp-revoke:${cliente.id}`, 60, 60_000))) return NextResponse.json({ error: 'temporarily_unavailable' }, { status: 429, headers });
  const token = corpo.get('token') ?? '';
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const identidade = verificarAccessToken(token);
  if (identidade?.aud === cliente.id) {
    await prisma.mcpTokenRevogado.upsert({ where: { tokenHash }, create: { tokenHash }, update: {} });
    if (identidade.familia) await revogarFamilia(identidade.familia);
  } else {
    const refresh = await prisma.refreshOAuth.findUnique({ where: { tokenHash } });
    if (refresh?.clienteId === cliente.id) await revogarFamilia(refresh.familia);
    const legado = await prisma.mcpAcessoLegado.findUnique({ where: { tokenHash } });
    if (legado?.clienteId === cliente.id) await revogarFamilia(legado.familia);
  }
  return NextResponse.json({}, { headers });
}
