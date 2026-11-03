import { Prisma } from "@prisma/client";
import {
  APPS_INICIAIS,
  lerCadastro,
  paraApp,
  recebeLogin,
  type AppRegistrado,
  type Cadastro,
} from "@/lib/apps";
import { prisma } from "@/lib/prisma";
import { normalizarPolitica, politicaLegada, type PoliticaAcesso } from "@/lib/politicaAplicacao";

/**
 * Cadastro de aplicações e sites, na tabela `aplicacoes`.
 *
 * É a fonte do que existe e de quem recebe sessão. As regras puras (validação,
 * destino pós-login) ficam em `apps.ts`; aqui é só o que toca o banco.
 */

/** Código do Prisma para "a tabela não existe no banco". */
function tabelaAusente(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2021" || e.code === "P2022");
}

async function buscarLinhasLegadas() {
  return prisma.aplicacao.findMany({ orderBy: [{ tipo: "asc" }, { nome: "asc" }] });
}

function inicialParaCadastro(a: AppRegistrado): Cadastro {
  return {
    id: a.id,
    host: a.host,
    nome: a.nome,
    tipo: "app",
    login: true,
    papelExigido: a.papelExigido === "ADMIN" ? "ADMIN" : null,
    restrito: a.restrito ?? false,
    exigeSegundoFator: a.exigeSegundoFator ?? false,
    dicaDominioGoogle: a.dicaDominioGoogle ?? null,
    deepLink: a.deepLink ?? null,
    repositorio: null,
    servidor: null,
    publicacao: null,
    situacao: "no_ar",
    observacao: null,
  };
}

/**
 * Tudo o que está cadastrado, apps e sites.
 *
 * Tabela ausente devolve a lista de fábrica: é o intervalo entre a imagem nova
 * subir e a migração rodar. Qualquer outro erro de banco sobe — responder com a
 * lista antiga num banco fora do ar religaria em silêncio um app que alguém
 * desativou no painel.
 */
export async function listarCadastro(): Promise<Cadastro[]> {
  try {
    let linhas;
    try {
      linhas = await prisma.aplicacao.findMany({ orderBy: [{ tipo: "asc" }, { nome: "asc" }], include: { politica: true } });
    } catch (e) {
      // A relação de política pode ainda não existir. O catálogo persistido
      // continua sendo a autoridade, inclusive para apps desativados.
      if (!tabelaAusente(e)) throw e;
      linhas = await buscarLinhasLegadas();
    }
    return linhas.map(lerCadastro);
  } catch (e) {
    if (tabelaAusente(e)) return APPS_INICIAIS.map(inicialParaCadastro);
    throw e;
  }
}

export async function buscarCadastro(id: string | null | undefined): Promise<Cadastro | null> {
  if (!id) return null;
  try {
    let linha;
    try {
      linha = await prisma.aplicacao.findUnique({ where: { id }, include: { politica: true } });
    } catch (e) {
      if (!tabelaAusente(e)) throw e;
      linha = await prisma.aplicacao.findUnique({ where: { id } });
    }
    return linha ? lerCadastro(linha) : null;
  } catch (e) {
    if (!tabelaAusente(e)) throw e;
    const inicial = APPS_INICIAIS.find((a) => a.id === id);
    return inicial ? inicialParaCadastro(inicial) : null;
  }
}

export async function politicaDaAplicacao(id: string): Promise<PoliticaAcesso | null> {
  const cadastro = await buscarCadastro(id);
  return cadastro?.politica ?? (cadastro ? politicaLegada(cadastro) : null);
}

/** Os que recebem sessão do login único. */
export async function listarApps(): Promise<AppRegistrado[]> {
  return (await listarCadastro()).filter(recebeLogin).map(paraApp);
}

/** O app pedido em `?app=`, se existir e receber sessão. */
export async function buscarApp(id: string | null | undefined): Promise<AppRegistrado | null> {
  const c = await buscarCadastro(id);
  return c && recebeLogin(c) ? paraApp(c) : null;
}

export async function criarCadastro(dados: Cadastro, autor: string): Promise<void> {
  const { politica: _, ...linha } = dados;
  await prisma.aplicacao.create({ data: { ...linha, atualizadoPor: autor.toLowerCase() } });
  await salvarPoliticaAplicacao(dados.id, dados.politica ?? politicaLegada(dados), autor);
}

/** O `id` não muda: é a chave das permissões já concedidas. */
export async function atualizarCadastro(id: string, dados: Cadastro, autor: string): Promise<void> {
  const { politica: _, ...linha } = dados;
  await prisma.aplicacao.update({ where: { id }, data: { ...linha, id, atualizadoPor: autor.toLowerCase() } });
  await salvarPoliticaAplicacao(id, dados.politica ?? politicaLegada(dados), autor);
}

export async function salvarPoliticaAplicacao(id: string, politica: PoliticaAcesso, autor: string): Promise<void> {
  const p = normalizarPolitica(politica);
  try {
    await prisma.politicaAplicacao.upsert({
      where: { aplicacaoId: id },
      create: { aplicacaoId: id, ...p, atualizadoPor: autor.toLowerCase() },
      update: { ...p, atualizadoPor: autor.toLowerCase() },
    });
  } catch (e) {
    if (!tabelaAusente(e)) throw e;
  }
}

/**
 * Apaga a linha e as permissões que apontavam para ela.
 *
 * Permissão órfã não é inofensiva: um app novo que reaproveitasse o mesmo `id`
 * nasceria com os clientes do antigo já liberados.
 */
export async function removerCadastro(id: string): Promise<void> {
  await prisma.$transaction([
    prisma.permissao.deleteMany({ where: { appId: id } }),
    prisma.aplicacao.delete({ where: { id } }),
  ]);
}

/** Violação de unicidade (id ou host já cadastrado). */
export function jaExiste(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}
