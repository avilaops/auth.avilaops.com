import { Prisma } from "@prisma/client";
import { poolPortal } from "@/lib/contas";
import { prisma } from "@/lib/prisma";

/**
 * Empresas, para filtrar e agrupar as listagens do painel.
 *
 * A empresa mora em `operations.organizations`, no banco do app.avilaops.com
 * (o mesmo das contas). O vínculo é sempre explícito:
 *
 * - conta → empresa: `portal_clients.organization_id` (uma empresa por conta);
 * - aplicação → empresa: `aplicacoes.organizacao_id`, neste banco, gravado na
 *   ficha da aplicação.
 *
 * Nada aqui deduz empresa por domínio de e-mail, nome da conta ou nome do
 * site. Sem vínculo, o registro aparece em "Sem empresa vinculada". Escolher
 * uma empresa como filtro é só um recorte da listagem: não muda sessão nem
 * permissão de ninguém.
 */

export type Empresa = { id: string; nome: string; situacao: string | null };

export const SEM_EMPRESA = "sem";
export const ROTULO_SEM_EMPRESA = "Sem empresa vinculada";

/**
 * Todas as empresas, em ordem alfabética.
 *
 * Se o esquema `operations` não existir ou a conta do banco não puder lê-lo, a
 * listagem segue sem empresas em vez de cair: o painel é o lugar onde se
 * conserta o acesso, não pode depender dele para abrir.
 */
export async function listarEmpresas(): Promise<Empresa[]> {
  try {
    const { rows } = await poolPortal().query<{ id: string; name: string; status: string | null }>(
      "select id, name, status from operations.organizations order by lower(name), id",
    );
    return rows.map((r) => ({ id: r.id, nome: r.name, situacao: r.status }));
  } catch (erro) {
    const codigo = (erro as { code?: string })?.code;
    // 3F000 esquema ausente, 42P01 tabela ausente, 42501 sem permissão.
    if (codigo === "3F000" || codigo === "42P01" || codigo === "42501") return [];
    throw erro;
  }
}

/** `id da aplicação → id da empresa`, só para as que têm vínculo. */
export async function empresasDasAplicacoes(): Promise<Map<string, string>> {
  try {
    const linhas = await prisma.aplicacao.findMany({ where: { organizacaoId: { not: null } }, select: { id: true, organizacaoId: true } });
    return new Map(linhas.flatMap((l) => (l.organizacaoId ? [[l.id, l.organizacaoId] as const] : [])));
  } catch (e) {
    // Coluna ou tabela ainda não migrada: ninguém tem vínculo.
    if (e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2021" || e.code === "P2022")) return new Map();
    throw e;
  }
}

/** Grava (ou tira, com `null`) a empresa responsável por uma aplicação. */
export async function vincularEmpresaDaAplicacao(appId: string, organizacaoId: string | null): Promise<void> {
  await prisma.aplicacao.update({ where: { id: appId }, data: { organizacaoId } });
}

export type Participacao = { organizacaoId: string; empresa: string; papel: string; situacao: string; origem: string; emVigor: boolean };

/**
 * Participações da conta em empresas, como o app.avilaops.com as enxerga.
 *
 * É a autorização de fato: o app abre os dados de uma empresa para quem tem
 * participação em vigor (`core.effective_memberships`). O painel só mostra;
 * quem grava é o gatilho do banco do app, a partir do vínculo da conta.
 * Devolve `null` quando o esquema não existe ou não pode ser lido, para a
 * tela dizer "não consegui ler" em vez de "nenhuma".
 */
export async function participacoesDaConta(contaId: string): Promise<Participacao[] | null> {
  try {
    const { rows } = await poolPortal().query<{ organization_id: string; name: string | null; role: string; status: string; source: string; em_vigor: boolean }>(
      `select m.organization_id, o.name, m.role, m.status, m.source,
              exists(select 1 from core.effective_memberships e where e.id = m.id) as em_vigor
         from core.memberships m left join operations.organizations o on o.id = m.organization_id
        where m.identity_id = $1 and m.status <> 'REVOKED'
        order by lower(o.name)`,
      [contaId],
    );
    return rows.map((r) => ({ organizacaoId: r.organization_id, empresa: r.name ?? "Empresa não encontrada", papel: r.role, situacao: r.status, origem: r.source, emVigor: r.em_vigor }));
  } catch (erro) {
    const codigo = (erro as { code?: string })?.code;
    if (codigo === "3F000" || codigo === "42P01" || codigo === "42501") return null;
    throw erro;
  }
}
