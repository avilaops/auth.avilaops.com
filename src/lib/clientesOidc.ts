import { CLIENTES_OIDC, gerarSegredoCliente, lerRedirectUris } from "@/lib/oidc";
import { prisma } from "@/lib/prisma";

/**
 * Cadastro de integrações (clientes OIDC e de API) feito pelo painel.
 *
 * A consulta que o login usa está em `oidc.ts` (`buscarCliente`). Aqui fica o
 * que o painel precisa: listar, validar, criar, alterar e trocar o segredo.
 */

export type Integracao = {
  id: string;
  appId: string;
  nome: string;
  redirectUris: string[];
  acessoMeta: boolean;
  ativo: boolean;
  origem: "codigo" | "painel";
  atualizadoEm: Date | null;
  atualizadoPor: string | null;
};

export type EntradaIntegracao = {
  id: string;
  appId: string;
  nome: string;
  redirectUris: string;
  acessoMeta: boolean;
  ativo: boolean;
};

/** P2021/P2022: migração ainda não aplicada. Mesmo critério do resto do auth. */
function semTabela(e: unknown): boolean {
  const codigo = (e as { code?: unknown })?.code;
  return codigo === "P2021" || codigo === "P2022";
}

/** Tudo o que existe: o cadastro do painel e, abaixo, a lista fixa do código. */
export async function listarIntegracoes(): Promise<Integracao[]> {
  let linhas: Awaited<ReturnType<typeof prisma.clienteOidc.findMany>> = [];
  try {
    linhas = await prisma.clienteOidc.findMany({ orderBy: { nome: "asc" } });
  } catch (e) {
    if (!semTabela(e)) throw e;
  }
  const doPainel: Integracao[] = linhas.map((l) => ({
    id: l.id,
    appId: l.appId,
    nome: l.nome,
    redirectUris: lerRedirectUris(l.redirectUris),
    acessoMeta: l.acessoMeta,
    ativo: l.ativo,
    origem: "painel",
    atualizadoEm: l.atualizadoEm,
    atualizadoPor: l.atualizadoPor,
  }));
  const ids = new Set(doPainel.map((i) => i.id));
  const doCodigo: Integracao[] = CLIENTES_OIDC.filter((c) => !ids.has(c.id)).map((c) => ({
    id: c.id,
    appId: c.appId,
    nome: c.nome,
    redirectUris: [...c.redirectUris],
    acessoMeta: c.acessoMeta,
    ativo: true,
    origem: "codigo",
    atualizadoEm: null,
    atualizadoPor: null,
  }));
  return [...doPainel, ...doCodigo];
}

export async function buscarIntegracao(id: string): Promise<Integracao | null> {
  return (await listarIntegracoes()).find((i) => i.id === id) ?? null;
}

/** Integrações que dependem de uma aplicação — ela não pode sumir do cadastro. */
export async function integracoesDoApp(appId: string): Promise<Integracao[]> {
  return (await listarIntegracoes()).filter((i) => i.appId === appId);
}

export type Validacao = { ok: true; dados: EntradaIntegracao } | { ok: false; erro: string };

/**
 * Regras do formulário. O endereço de retorno é o que impede um código de
 * login de ser entregue a um site qualquer, então é o campo mais vigiado:
 * https obrigatório (http só em localhost), sem fragmento e sem curinga.
 */
export function validarIntegracao(e: EntradaIntegracao, opts: { exigeRetorno: boolean }): Validacao {
  const id = e.id.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(id)) {
    return { ok: false, erro: "Identificador: 2 a 63 caracteres, só letras minúsculas, números e hífen." };
  }
  const nome = e.nome.trim();
  if (!nome || nome.length > 80) return { ok: false, erro: "Informe um nome de até 80 caracteres." };
  const appId = e.appId.trim();
  if (!appId) return { ok: false, erro: "Escolha a aplicação a que esta integração pertence." };

  const uris = lerRedirectUris(e.redirectUris);
  if (opts.exigeRetorno && uris.length === 0) {
    return { ok: false, erro: "Informe ao menos um endereço de retorno, ou marque só o acesso à API." };
  }
  for (const u of uris) {
    let url: URL;
    try {
      url = new URL(u);
    } catch {
      return { ok: false, erro: `Endereço de retorno inválido: ${u}` };
    }
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
      return { ok: false, erro: `Endereço de retorno precisa ser https: ${u}` };
    }
    if (url.hash || u.includes("*")) return { ok: false, erro: `Endereço de retorno não pode ter # nem curinga: ${u}` };
  }

  return { ok: true, dados: { id, nome, appId, redirectUris: uris.join("\n"), acessoMeta: e.acessoMeta, ativo: e.ativo } };
}

/** Cria e devolve o segredo — é a única vez que ele existe em claro. */
export async function criarIntegracao(dados: EntradaIntegracao, autor: string): Promise<string> {
  const { segredo, hash } = gerarSegredoCliente();
  await prisma.clienteOidc.create({ data: { ...dados, segredoHash: hash, atualizadoPor: autor } });
  return segredo;
}

export async function atualizarIntegracao(id: string, dados: Omit<EntradaIntegracao, "id">, autor: string): Promise<void> {
  await prisma.clienteOidc.update({ where: { id }, data: { ...dados, atualizadoPor: autor } });
}

/** Troca o segredo. O anterior deixa de valer na hora. */
export async function trocarSegredo(id: string, autor: string): Promise<string> {
  const { segredo, hash } = gerarSegredoCliente();
  await prisma.clienteOidc.update({ where: { id }, data: { segredoHash: hash, atualizadoPor: autor } });
  return segredo;
}

export async function removerIntegracao(id: string): Promise<void> {
  await prisma.clienteOidc.delete({ where: { id } });
}

export function jaExisteIntegracao(e: unknown): boolean {
  return (e as { code?: unknown })?.code === "P2002";
}
