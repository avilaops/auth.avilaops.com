import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { buscarCliente } from '@/lib/oidc';
import { prisma } from '@/lib/prisma';
import { limitar } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const resposta = (corpo: object, status: number) => NextResponse.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(req: NextRequest) {
  const gatewayId = process.env.MCP_GATEWAY_CLIENT_ID;
  const gateway = gatewayId ? await buscarCliente(gatewayId) : null;
  if (!gateway || gateway.appId !== 'mcp') return resposta({ error: 'temporarily_unavailable' }, 503);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!(await limitar(`mcp-register:${ip}`, 20, 3600_000))) return resposta({ error: 'too_many_requests' }, 429);
  const texto = await req.text();
  if (Buffer.byteLength(texto) > 16 * 1024) return resposta({ error: 'invalid_client_metadata' }, 400);
  let dados;
  try { dados = JSON.parse(texto); } catch { return resposta({ error: 'invalid_client_metadata' }, 400); }
  if (!Array.isArray(dados?.redirect_uris) || !dados.redirect_uris.length || dados.redirect_uris.length > 10
    || (dados.token_endpoint_auth_method && dados.token_endpoint_auth_method !== 'none')) return resposta({ error: 'invalid_client_metadata' }, 400);
  const uris: string[] = [];
  for (const uri of dados.redirect_uris) {
    if (typeof uri !== 'string' || uri.length > 2048) return resposta({ error: 'invalid_redirect_uri' }, 400);
    try {
      const u = new URL(uri);
      if (u.hash || u.username || u.password || !(u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(u.hostname)))) throw new Error();
    } catch { return resposta({ error: 'invalid_redirect_uri' }, 400); }
    uris.push(uri);
  }
  const id = `mcp_${randomBytes(18).toString('hex')}`;
  const nome = typeof dados.client_name === 'string' ? dados.client_name.replace(/[\x00-\x1f]/g, '').slice(0, 100) : 'Conector MCP';
  // Sem segredo público; um hash aleatório inutilizável mantém o contrato existente.
  await prisma.$transaction(async tx => {
    await tx.clienteOidc.create({ data: { id, appId: 'mcp', nome, ambienteId: null,
      redirectUris: uris.join('\n'), segredoHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
      redirects: { create: uris.map(uri => ({ uri, tipo: 'authorization' })) } } });
    await tx.mcpClientePublico.create({ data: { clienteId: id, gatewayId: gateway.id } });
  });
  return resposta({ client_id: id, client_name: nome, redirect_uris: uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }, 201);
}
