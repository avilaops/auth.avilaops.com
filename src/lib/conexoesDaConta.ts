import { prisma } from "@/lib/prisma";
import { paginaDaConta } from "@/lib/secoesDaConta";

export type ConexaoDaConta = {
  id: string; nome: string; sistema: string; empresa: string; unidade: string | null;
  operacoes: string[]; autorizadaEm: string; integracaoAtiva: boolean;
};
const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;

/** Metadados de consentimento, sem retornar tokens ou inferir autorização atual. */
export async function conexoesDaConta(contaId: string, pagina = 1): Promise<{ conexoes: ConexaoDaConta[]; temMais: boolean }> {
  const linhas = await prisma.mcpConexao.findMany({
    where: { sub: contaId, revogadoEm: null, usadoEm: { not: null } },
    skip: (paginaDaConta(pagina) - 1) * 50, take: 51, orderBy: [{ criadoEm: "desc" }, { id: "asc" }],
    include: { cliente: { select: { nome: true, ativo: true, aplicacao: { select: { nome: true } } } } },
  });
  const ids = [...new Set(linhas.map((c) => c.organizacaoId).filter((id) => uuid.test(id)))];
  const unidades = [...new Set(linhas.flatMap((c) => c.unidadeId && uuid.test(c.unidadeId) ? [c.unidadeId] : []))];
  const empresas = await prisma.organizacaoCorporativa.findMany({
    where: { id: { in: ids }, vinculos: { some: { contaId } } },
    select: { id: true, nome: true, unidades: { where: { id: { in: unidades } }, select: { id: true, nome: true } } },
  });
  const porEmpresa = new Map(empresas.map((e) => [e.id, e]));
  return { temMais: linhas.length > 50, conexoes: linhas.slice(0, 50).map((c) => {
    const empresa = porEmpresa.get(c.organizacaoId);
    return { id: c.id, nome: c.cliente.nome, sistema: c.cliente.aplicacao.nome,
      empresa: empresa?.nome ?? "Empresa indisponível",
      unidade: c.unidadeId ? empresa?.unidades.find((u) => u.id === c.unidadeId)?.nome ?? "Unidade indisponível" : null,
      operacoes: c.operacoes, autorizadaEm: c.criadoEm.toISOString(), integracaoAtiva: c.cliente.ativo };
  }) };
}

export async function revogarConexaoDaConta(contaId: string, email: string, id: string): Promise<boolean> {
  if (!id || id.length > 200) return false;
  return prisma.$transaction(async (tx) => {
    const resultado = await tx.mcpConexao.updateMany({ where: { id, sub: contaId, revogadoEm: null, usadoEm: { not: null } }, data: { revogadoEm: new Date() } });
    if (!resultado.count) return false;
    await tx.refreshOAuth.updateMany({ where: { mcpConexaoId: id, sub: contaId, revogadoEm: null }, data: { revogadoEm: new Date() } });
    await tx.evento.create({ data: { tipo: "mcp_conexao_revogada", email, autor: email, detalhe: JSON.stringify({ conexaoId: id, contaId }) } });
    return true;
  });
}
