import { lerConsultaEmpresas, type PaginaOpcoes } from "@/lib/empresasConsulta";
import type { Sessao } from "@/lib/sessao";

type Dependencias = {
  sessao: () => Promise<Sessao | null>;
  admin: (sessao: Sessao) => boolean;
  precisaFator: (sessao: Sessao) => Promise<boolean>;
  limitar: (email: string) => Promise<boolean>;
  consultar: (busca: string, pag: number) => Promise<PaginaOpcoes>;
};

/** Ordem dos controles é parte do contrato: nenhuma leitura antes de autorizar. */
export async function executarConsultaEmpresas(params: URLSearchParams, d: Dependencias) {
  const sessao = await d.sessao();
  if (!sessao) return { status: 401, corpo: { erro: "Entre novamente no painel" } };
  if (!d.admin(sessao)) return { status: 403, corpo: { erro: "Sem permissão" } };
  if (!sessao.mfa && await d.precisaFator(sessao)) {
    return { status: 403, corpo: { erro: "Confirme a verificação em duas etapas no painel" } };
  }
  let consulta;
  try { consulta = lerConsultaEmpresas(params); }
  catch { return { status: 400, corpo: { erro: "Busca ou página inválida" } }; }
  if (!await d.limitar(sessao.email)) return { status: 429, corpo: { erro: "Aguarde antes de pesquisar novamente" } };
  try {
    return { status: 200, corpo: await d.consultar(consulta.busca, consulta.pag) };
  } catch {
    return { status: 503, corpo: { erro: "Não foi possível consultar as empresas. Tente novamente." } };
  }
}
