import { prisma } from "@/lib/prisma";
import { normalizarPapelCorporativo } from "@/lib/corporativo";
import type { Cadastro } from "@/lib/apps";

export type VinculoDaConta = {
  id: string;
  empresa: string;
  sistema: string;
  situacao: "ATIVO" | "SUSPENSO" | "REVOGADO" | "SEM_AUTORIZACAO";
  acessoAoSistema: boolean;
  papeis: Array<{ papel: string; unidade: string | null }>;
};

/** Projeção informativa. Não seleciona empresa, concede acesso ou infere convite. */
export async function acessosDaConta(contaId: string, cadastro: Cadastro[], appsAutorizados: string[]): Promise<{ vinculos: VinculoDaConta[]; temMais: boolean }> {
  const linhas = await prisma.vinculoCorporativo.findMany({
    where: { contaId }, take: 51, orderBy: [{ organizacao: { nome: "asc" } }, { id: "asc" }],
    include: { organizacao: true, autorizacoes: { include: { unidade: true }, orderBy: { id: "asc" } } },
  });
  const clientes = await prisma.clienteOidc.findMany({
    where: { id: { in: [...new Set(linhas.map((v) => v.organizacao.clienteId))] } }, select: { id: true, appId: true, ativo: true },
  });
  const porCliente = new Map(clientes.map((c) => [c.id, c]));
  const porApp = new Map(cadastro.map((c) => [c.id, c]));
  const liberados = new Set(appsAutorizados);
  const vinculos = linhas.slice(0, 50).map((v): VinculoDaConta => {
    const cliente = porCliente.get(v.organizacao.clienteId);
    const app = cliente ? porApp.get(cliente.appId) : undefined;
    const papeis = v.autorizacoes.filter((a) => normalizarPapelCorporativo(a.papel)
      && (!a.unidadeId || (a.unidade?.situacao === "ATIVO" && a.unidade.organizacaoId === v.organizacaoId)))
      .map((a) => ({ papel: a.papel, unidade: a.unidade?.nome ?? null }));
    const situacao = v.situacao === "REVOGADO" || v.organizacao.situacao === "REVOGADO" ? "REVOGADO"
      : v.situacao !== "ATIVO" || v.organizacao.situacao !== "ATIVO" ? "SUSPENSO"
      : papeis.length ? "ATIVO" : "SEM_AUTORIZACAO";
    return {
      id: v.id, empresa: v.organizacao.nome, sistema: app?.nome ?? "Sistema não disponível",
      situacao, acessoAoSistema: Boolean(cliente?.ativo && app && app.situacao === "no_ar" && liberados.has(app.id)),
      papeis: situacao === "ATIVO" ? papeis : [],
    };
  });
  return { vinculos, temMais: linhas.length > 50 };
}
