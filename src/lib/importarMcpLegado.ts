import { createHash, randomBytes } from 'node:crypto';
import { buscarCliente } from '@/lib/oidc';
import { buscarConta } from '@/lib/contas';
import { listarContextosCorporativos } from '@/lib/corporativo';
import { prisma } from '@/lib/prisma';

type Cliente = { id: string; nome: string; redirect_uris: string };
type Token = { hash: string; tipo: string; familia: string; cliente_id: string; recurso: string | null; sub: string; expira_em: number; usado: number; criado_em: number };
export type SnapshotMcp = { clientes: Cliente[]; tokens: Token[] };
export type MapaMcp = Array<{ familia: string; organizacaoId: string; unidadeId?: string; operacoes: string[]; recurso: string }>;

/** Validação sem I/O, antes de qualquer escrita. Sem tenant presumido. */
export function planejarImportacaoMcp(snapshot: SnapshotMcp, mapa: MapaMcp, agora = Date.now()) {
  if (!Array.isArray(snapshot.clientes) || !Array.isArray(snapshot.tokens) || !Array.isArray(mapa)) throw new Error('Snapshot inválido');
  const vivos = snapshot.tokens.filter(t => t.expira_em * 1000 > agora);
  const familias = [...new Set(vivos.map(t => t.familia))];
  return familias.map(familia => {
    const tokens = vivos.filter(t => t.familia === familia);
    const mapas = mapa.filter(m => m.familia === familia);
    if (mapas.length !== 1) throw new Error('Toda família exige mapeamento explícito e único');
    const contexto = mapas[0];
    if (!contexto.organizacaoId || !contexto.recurso || !contexto.operacoes.length || contexto.operacoes.some(o => !['read', 'write', 'delete'].includes(o))) throw new Error('Consentimento de migração inválido');
    const primeiro = tokens[0];
    if (tokens.some(t => !/^[a-f0-9]{64}$/.test(t.hash) || !['acesso', 'renovacao'].includes(t.tipo)
      || t.cliente_id !== primeiro.cliente_id || t.sub !== primeiro.sub || !Number.isSafeInteger(t.expira_em)
      || (t.recurso !== null && t.recurso !== contexto.recurso))) throw new Error('Família inconsistente');
    if (!tokens.some(t => t.tipo === 'renovacao' && t.usado === 0)) throw new Error('Família sem renovação ativa');
    const cliente = snapshot.clientes.find(c => c.id === primeiro.cliente_id);
    if (!cliente) throw new Error('Cliente ausente');
    const uris: unknown = JSON.parse(cliente.redirect_uris);
    if (!Array.isArray(uris) || !uris.length || uris.some(u => typeof u !== 'string')) throw new Error('Destinos inválidos');
    for (const uri of uris) {
      const u = new URL(uri);
      if (u.hash || u.username || u.password || !(u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)))) throw new Error('Destino inseguro');
    }
    return { familia, cliente, uris: uris as string[], tokens, contexto, sub: primeiro.sub };
  });
}

/** Só invocada pelo comando explícito de importação após aprovação operacional. */
export async function importarMcpLegado(snapshot: SnapshotMcp, mapa: MapaMcp, gatewayId: string, aplicar = false) {
  const planos = planejarImportacaoMcp(snapshot, mapa);
  const gateway = await buscarCliente(gatewayId);
  if (!gateway || gateway.appId !== 'mcp' || gateway.mcpGatewayId) throw new Error('Gateway inválido');
  const validados: Array<(typeof planos)[number] & { conta: NonNullable<Awaited<ReturnType<typeof buscarConta>>> }> = [];
  for (const plano of planos) {
    const conta = await buscarConta(plano.sub);
    if (!conta?.ativa) throw new Error('Conta inativa ou inexistente');
    const contextos = await listarContextosCorporativos(conta.id, gatewayId);
    const org = contextos.find(c => c.organizacaoId === plano.contexto.organizacaoId);
    if (!org || (plano.contexto.unidadeId && !org.unidades.some(u => u.id === plano.contexto.unidadeId))) throw new Error('Vínculo corporativo não confirmado');
    validados.push({ ...plano, conta });
  }
  if (aplicar) await prisma.$transaction(async tx => {
    for (const p of validados) {
      const anterior = await tx.clienteOidc.findUnique({ where: { id: p.cliente.id } });
      const publico = await tx.mcpClientePublico.findUnique({ where: { clienteId: p.cliente.id } });
      if (anterior && (anterior.appId !== 'mcp' || publico?.gatewayId !== gatewayId || anterior.redirectUris !== p.uris.join('\n'))) throw new Error('Colisão de cliente');
      if (!anterior) {
        await tx.clienteOidc.create({ data: { id: p.cliente.id, nome: p.cliente.nome, appId: 'mcp', redirectUris: p.uris.join('\n'), segredoHash: createHash('sha256').update(randomBytes(32)).digest('hex'), redirects: { create: p.uris.map(uri => ({ uri })) } } });
        await tx.mcpClientePublico.create({ data: { clienteId: p.cliente.id, gatewayId } });
      }
      const id = `legacy-${gatewayId}-${p.familia}`;
      const existente = await tx.mcpConexao.findUnique({ where: { id } });
      if (existente && (existente.sub !== p.sub || existente.organizacaoId !== p.contexto.organizacaoId || existente.unidadeId !== (p.contexto.unidadeId ?? null)
        || existente.recurso !== p.contexto.recurso || JSON.stringify(existente.operacoes) !== JSON.stringify(p.contexto.operacoes))) throw new Error('Mapeamento alterado após importação');
      if (!existente) await tx.mcpConexao.create({ data: { id, sub: p.sub, clienteId: p.cliente.id, organizacaoId: p.contexto.organizacaoId,
        unidadeId: p.contexto.unidadeId, operacoes: p.contexto.operacoes, recurso: p.contexto.recurso, pedidoHash: 'migracao-aprovada', usadoEm: new Date() } });
      // Nunca atualiza linha existente: repetir não desfaz revogação nem consumo.
      for (const t of p.tokens) {
        if (t.tipo === 'acesso') await tx.mcpAcessoLegado.createMany({ skipDuplicates: true, data: [{ tokenHash: t.hash, familia: p.familia, clienteId: p.cliente.id, sub: p.sub, expiraEm: new Date(t.expira_em * 1000) }] });
        else await tx.refreshOAuth.createMany({ skipDuplicates: true, data: [{ tokenHash: t.hash, familia: p.familia, clienteId: p.cliente.id, sub: p.sub, email: p.conta.email,
          mcpConexaoId: id, escopo: 'openid profile email corporate_context', expiraEm: new Date(t.expira_em * 1000), criadoEm: new Date(t.criado_em * 1000), usadoEm: t.usado ? new Date() : null }] });
      }
    }
  });
  // Somente contagens, sem sujeitos, nomes, hashes, destinos ou empresas.
  return { aplicado: aplicar, familias: planos.length, tokens: planos.reduce((n, p) => n + p.tokens.length, 0) };
}
