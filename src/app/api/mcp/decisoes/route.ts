import { NextRequest, NextResponse } from 'next/server';
import { autorizarOperacaoMcp } from '@/lib/acessoMcp';
import { autenticarCliente } from '@/lib/oidc';
import { limitar } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const resposta = (corpo: object, status = 200) => NextResponse.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: NextRequest) {
  // Credencial técnica autentica o gateway; o Bearer continua sendo da pessoa.
  const cliente = await autenticarCliente(req.headers.get('x-avila-gateway-authorization'));
  if (!cliente || cliente.appId !== 'mcp') return resposta({ permitido: false }, 401);
  if (!(await limitar(`mcp-decisao:${cliente.id}`, 600, 60_000))) return resposta({ permitido: false }, 429);
  const token = req.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token) return resposta({ permitido: false }, 401);
  // Mesmo teto do gateway. Não registrar corpo, cabeçalhos ou erros com tokens.
  const texto = await req.text();
  if (Buffer.byteLength(texto) > 4 * 1024 * 1024 + 4096) return resposta({ permitido: false }, 413);
  let corpo;
  try { corpo = JSON.parse(texto); } catch { return resposta({ permitido: false }, 400); }
  if (!corpo || (corpo.organizacaoId !== undefined && typeof corpo.organizacaoId !== 'string') || typeof corpo.metodoHttp !== 'string'
    || (corpo.unidadeId !== undefined && typeof corpo.unidadeId !== 'string')) return resposta({ permitido: false }, 400);
  try {
    const decisao = await autorizarOperacaoMcp(token, cliente.id, corpo);
    return decisao ? resposta(decisao, decisao.permitido ? 200 : 403) : resposta({ permitido: false }, 401);
  } catch {
    // Migração ausente e indisponibilidade não reativam política legada.
    return resposta({ permitido: false }, 503);
  }
}
