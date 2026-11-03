import { createHash } from 'node:crypto';
import { buscarApp } from '@/lib/cadastro';
import { buscarConta, papelDaRole } from '@/lib/contas';
import { listarContextosCorporativos } from '@/lib/corporativo';
import { decidirMcp, type PedidoMcp } from '@/lib/decisaoMcp';
import { buscarCliente, verificarAccessToken } from '@/lib/oidc';
import { podeEntrar } from '@/lib/permissoes';
import { prisma } from '@/lib/prisma';

export const hashTokenMcp = (token: string) => createHash('sha256').update(token).digest('hex');

/** Nenhum cache positivo: uma revogação vale na próxima operação. */
export async function autorizarOperacaoMcp(token: string, clienteId: string, pedido: PedidoMcp) {
  const legado = await prisma.mcpAcessoLegado.findUnique({ where: { tokenHash: hashTokenMcp(token) } });
  const identidade = verificarAccessToken(token) ?? (legado && legado.expiraEm > new Date()
    ? { sub: legado.sub, aud: legado.clienteId, familia: legado.familia, escopos: ['corporate_context'] } : null);
  if (!identidade || !identidade.escopos.includes('corporate_context')) return null;
  const cliente = await buscarCliente(identidade.aud);
  if (!cliente || cliente.appId !== 'mcp') return null;
  if ((cliente.mcpGatewayId ?? cliente.id) !== clienteId) return null;
  if (!identidade.familia) return null;
  const familiaAtiva = await prisma.refreshOAuth.findFirst({ where: {
    familia: identidade.familia, clienteId: cliente.id, sub: identidade.sub,
    revogadoEm: null, usadoEm: null, expiraEm: { gt: new Date() },
  } });
  if (!familiaAtiva) return null;
  const conexao = familiaAtiva.mcpConexaoId ? await prisma.mcpConexao.findUnique({ where: { id: familiaAtiva.mcpConexaoId } }) : null;
  if (!conexao || conexao.revogadoEm || conexao.sub !== identidade.sub || conexao.clienteId !== cliente.id
    || (pedido.organizacaoId && conexao.organizacaoId !== pedido.organizacaoId)
    || (pedido.unidadeId && conexao.unidadeId !== pedido.unidadeId) || conexao.recurso !== pedido.recurso) return null;
  if (await prisma.mcpTokenRevogado.findUnique({ where: { tokenHash: hashTokenMcp(token) } })) return null;
  const conta = await buscarConta(identidade.sub);
  const app = await buscarApp(cliente.appId);
  if (!conta?.ativa || !app || !(await podeEntrar(conta.email, papelDaRole(conta.role), app))) return null;
  const contextos = await listarContextosCorporativos(conta.id, clienteId);
  const politicas = await prisma.mcpPoliticaFerramenta.findMany({ where: { clienteId, recurso: conexao.recurso, ativo: true, operacao: { in: conexao.operacoes } } });
  return decidirMcp(contextos, politicas, { ...pedido, organizacaoId: conexao.organizacaoId, unidadeId: conexao.unidadeId ?? undefined });
}
