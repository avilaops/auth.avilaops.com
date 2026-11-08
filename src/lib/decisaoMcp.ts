/** Contrato puro: a política vem do Auth, nunca do conector. */
export const CONTRATO_DECISAO_MCP = "avila.mcp.decisao.v1";

export type ContextoMcp = {
  organizacaoId: string;
  referenciaExterna: string;
  autorizacoesOrganizacao: Array<{ papel: string }>;
  unidades: Array<{ id: string; referenciaExterna: string; autorizacoes: Array<{ papel: string }> }>;
};
export type PoliticaFerramentaMcp = {
  ferramenta: string;
  papeis: string[];
  argumentoEmpresa: string;
  argumentoUnidade: string | null;
  operacao: string;
};
export type PedidoMcp = {
  organizacaoId?: string;
  unidadeId?: string;
  recurso?: string;
  metodoHttp: string;
  mensagem?: unknown;
};

/** Nunca deriva empresa de e-mail ou de papel global ADMIN. */
export function decidirMcp(contextos: ContextoMcp[], politicas: PoliticaFerramentaMcp[], pedido: PedidoMcp) {
  const negar = () => ({ permitido: false as const, contrato: CONTRATO_DECISAO_MCP });
  const contexto = contextos.find(c => c.organizacaoId === pedido.organizacaoId);
  if (!contexto) return negar();
  const unidade = pedido.unidadeId ? contexto.unidades.find(u => u.id === pedido.unidadeId) : undefined;
  if (pedido.unidadeId && !unidade) return negar();
  const papeis = [...contexto.autorizacoesOrganizacao, ...(unidade?.autorizacoes ?? [])].map(a => a.papel);
  if (papeis.length === 0) return negar();
  if (!['GET', 'POST', 'DELETE'].includes(pedido.metodoHttp)) return negar();
  // SSE e encerramento de transporte não concedem operações comerciais.
  if (pedido.metodoHttp === 'POST') {
    const mensagem = pedido.mensagem;
    // Batches não podem esconder chamadas de outra empresa.
    if (!mensagem || typeof mensagem !== 'object' || Array.isArray(mensagem)) return negar();
    const rpc = mensagem as { jsonrpc?: unknown; method?: unknown; params?: unknown };
    if (rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') return negar();
    if (!['initialize', 'ping', 'notifications/initialized', 'tools/list', 'tools/call'].includes(rpc.method)) return negar();
    // Listagem é sintetizada pelo gateway com o catálogo autorizado do Auth.
    if (rpc.method === 'tools/call') {
      const params = rpc.params as { name?: unknown; arguments?: unknown } | undefined;
      const politica = politicas.find(p => p.ferramenta === params?.name);
      if (!politica || !['read', 'write', 'delete'].includes(politica.operacao) || !politica.papeis.some(p => papeis.includes(p))) return negar();
      const args = params?.arguments;
      if (!args || typeof args !== 'object' || Array.isArray(args)) return negar();
      const campos = args as Record<string, unknown>;
      // Igualdade estrita: nenhum valor do cliente é reescrito silenciosamente.
      if (!politica.argumentoEmpresa || campos[politica.argumentoEmpresa] !== contexto.referenciaExterna) return negar();
      if (politica.argumentoUnidade && (!unidade || campos[politica.argumentoUnidade] !== unidade.referenciaExterna)) return negar();
    }
  }
  return {
    permitido: true as const,
    contrato: CONTRATO_DECISAO_MCP,
    organizacaoId: contexto.organizacaoId,
    empresa: contexto.referenciaExterna,
    unidadeId: unidade?.id ?? null,
    unidade: unidade?.referenciaExterna ?? null,
    ferramentas: politicas.filter(p => p.papeis.some(papel => papeis.includes(papel))).map(p => p.ferramenta),
  };
}
