"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdminAction } from "@/lib/admin";
import { buscarCadastro } from "@/lib/cadastro";
import {
  atualizarIntegracao,
  buscarIntegracao,
  criarIntegracao,
  jaExisteIntegracao,
  removerIntegracao,
  trocarSegredo,
  validarIntegracao,
  type EntradaIntegracao,
} from "@/lib/clientesOidc";
import { registrar } from "@/lib/eventos";
import { CLIENTES_OIDC } from "@/lib/oidc";
import type { Resultado } from "../actions";

/**
 * Mutations do cadastro de integrações. Mesma regra do painel: sessão de
 * admin com segundo fator e rastro em `eventos`. Quem cadastra uma integração
 * está dizendo para onde o auth pode entregar um login — e, com o acesso à
 * Meta, quem pode ler o token dos clientes.
 */

function texto(fd: FormData, campo: string): string {
  const v = fd.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

function ler(fd: FormData, id: string): EntradaIntegracao {
  return {
    id,
    appId: texto(fd, "appId"),
    nome: texto(fd, "nome"),
    redirectUris: texto(fd, "redirectUris"),
    acessoMeta: fd.get("acessoMeta") === "on",
    ativo: fd.get("ativo") === "on",
  };
}

function resumo(e: EntradaIntegracao): string {
  const retornos = e.redirectUris ? e.redirectUris.split("\n").length : 0;
  return `app ${e.appId} · ${retornos} retorno${retornos === 1 ? "" : "s"}${e.acessoMeta ? " · acesso à Meta" : ""}${e.ativo ? "" : " · desativada"}`;
}

export async function acaoCriarIntegracao(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const entrada = ler(fd, texto(fd, "id"));
  // Nasce ativa: o formulário de criação não tem a caixa "ativa".
  entrada.ativo = true;
  const v = validarIntegracao(entrada, { exigeRetorno: !entrada.acessoMeta });
  if (!v.ok) return { ok: false, erro: v.erro };

  if (CLIENTES_OIDC.some((c) => c.id === v.dados.id)) {
    return { ok: false, erro: "Este identificador já é usado por uma integração fixa do código." };
  }
  if (!(await buscarCadastro(v.dados.appId))) return { ok: false, erro: "Aplicação não encontrada no cadastro." };

  let segredo: string;
  try {
    segredo = await criarIntegracao(v.dados, admin.email);
  } catch (e) {
    if (jaExisteIntegracao(e)) return { ok: false, erro: "Já existe uma integração com este identificador." };
    throw e;
  }
  await registrar({ tipo: "integracao_criada", appId: v.dados.appId, autor: admin.email, detalhe: `${v.dados.id}: ${resumo(v.dados)}` });
  revalidatePath("/admin/integracoes");
  return { ok: true, mensagem: `Integração "${v.dados.id}" criada. Segredo (client_secret):`, segredo };
}

export async function acaoSalvarIntegracao(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const atual = await buscarIntegracao(texto(fd, "id"));
  if (!atual || atual.origem !== "painel") return { ok: false, erro: "Integração não encontrada no cadastro do painel." };

  const v = validarIntegracao(ler(fd, atual.id), { exigeRetorno: fd.get("acessoMeta") !== "on" });
  if (!v.ok) return { ok: false, erro: v.erro };
  if (!(await buscarCadastro(v.dados.appId))) return { ok: false, erro: "Aplicação não encontrada no cadastro." };

  const { id: _id, ...dados } = v.dados;
  void _id;
  await atualizarIntegracao(atual.id, dados, admin.email);
  await registrar({ tipo: "integracao_alterada", appId: v.dados.appId, autor: admin.email, detalhe: `${atual.id}: ${resumo(v.dados)}` });
  revalidatePath("/admin/integracoes");
  revalidatePath(`/admin/integracoes/${atual.id}`);
  return { ok: true, mensagem: "Salvo." };
}

export async function acaoTrocarSegredoIntegracao(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const atual = await buscarIntegracao(texto(fd, "id"));
  if (!atual || atual.origem !== "painel") return { ok: false, erro: "Integração não encontrada no cadastro do painel." };

  const segredo = await trocarSegredo(atual.id, admin.email);
  await registrar({ tipo: "integracao_segredo_trocado", appId: atual.appId, autor: admin.email, detalhe: atual.id });
  return { ok: true, mensagem: "Segredo novo. O anterior já não vale:", segredo };
}

export async function acaoRemoverIntegracao(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const atual = await buscarIntegracao(texto(fd, "id"));
  if (!atual || atual.origem !== "painel") return { ok: false, erro: "Integração não encontrada no cadastro do painel." };

  await removerIntegracao(atual.id);
  await registrar({ tipo: "integracao_removida", appId: atual.appId, autor: admin.email, detalhe: atual.id });
  revalidatePath("/admin/integracoes");
  redirect("/admin/integracoes");
}
