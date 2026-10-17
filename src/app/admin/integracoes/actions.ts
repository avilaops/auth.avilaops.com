"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdminAction } from "@/lib/admin";
import { buscarCadastro } from "@/lib/cadastro";
import { agendarTroca, trocarAgora } from "@/lib/chaveOidc";
import {
  atualizarIntegracao,
  buscarIntegracao,
  criarIntegracao,
  exigeRetornoAoSalvar,
  jaExisteIntegracao,
  removerIntegracao,
  trocarSegredo,
  validarIntegracao,
  type EntradaIntegracao,
} from "@/lib/clientesOidc";
import { registrar } from "@/lib/eventos";
import { apagarCanalDoCliente } from "@/lib/ssf";
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
    logoutUri: texto(fd, "logoutUri"),
    ssf: fd.get("ssf") === "on",
  };
}

function resumo(e: EntradaIntegracao): string {
  const retornos = e.redirectUris ? e.redirectUris.split("\n").length : 0;
  return `app ${e.appId} · ${retornos} retorno${retornos === 1 ? "" : "s"}${e.acessoMeta ? " · acesso à Meta" : ""}${e.logoutUri ? " · avisada da saída" : ""}${e.ssf ? " · recebe sinais de segurança" : ""}${e.ativo ? "" : " · desativada"}`;
}

export async function acaoCriarIntegracao(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const entrada = ler(fd, texto(fd, "id"));
  // Nasce ativa: o formulário de criação não tem a caixa "ativa".
  entrada.ativo = true;
  const v = validarIntegracao(entrada, { exigeRetorno: !entrada.acessoMeta });
  if (!v.ok) return { ok: false, erro: v.erro };

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
  if (!atual) return { ok: false, erro: "Integração não encontrada no cadastro do painel." };

  const v = validarIntegracao(ler(fd, atual.id), {
    exigeRetorno: exigeRetornoAoSalvar(atual, fd.get("acessoMeta") === "on"),
  });
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
  if (!atual) return { ok: false, erro: "Integração não encontrada no cadastro do painel." };

  const segredo = await trocarSegredo(atual.id, admin.email);
  await registrar({ tipo: "integracao_segredo_trocado", appId: atual.appId, autor: admin.email, detalhe: atual.id });
  return { ok: true, mensagem: "Segredo novo. O anterior já não vale:", segredo };
}

export async function acaoRemoverIntegracao(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const atual = await buscarIntegracao(texto(fd, "id"));
  if (!atual) return { ok: false, erro: "Integração não encontrada no cadastro do painel." };

  await removerIntegracao(atual.id);
  await apagarCanalDoCliente(atual.id);
  await registrar({ tipo: "integracao_removida", appId: atual.appId, autor: admin.email, detalhe: atual.id });
  revalidatePath("/admin/integracoes");
  redirect("/admin/integracoes");
}

/** Troca agendada da chave de assinatura: a nova é publicada agora e assina daqui a um dia. */
export async function acaoAgendarTrocaDeChave(_: Resultado | null, _fd: FormData): Promise<Resultado> {
  void _fd;
  const admin = await exigirAdminAction();
  const nova = await agendarTroca();
  if (!nova) return { ok: false, erro: "Já há uma troca agendada. Espere ela entrar em vigor." };
  await registrar({ tipo: "chave_oidc_agendada", autor: admin.email, detalhe: `${nova.kid} assina a partir de ${nova.assinaDesde.toISOString()}` });
  revalidatePath("/admin/integracoes");
  return { ok: true, mensagem: "Chave nova publicada. Ela passa a assinar em 24 horas; a atual sai sozinha depois." };
}

/** Troca na hora, para chave vazada. Pede confirmação: tokens já emitidos deixam de conferir. */
export async function acaoTrocarChaveAgora(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  if (fd.get("confirmar") !== "on") return { ok: false, erro: "Marque a confirmação: os tokens já emitidos deixam de conferir." };
  const kid = await trocarAgora();
  await registrar({ tipo: "chave_oidc_trocada", autor: admin.email, detalhe: `${kid} assina a partir de agora; as anteriores foram apagadas` });
  revalidatePath("/admin/integracoes");
  return { ok: true, mensagem: "Chave trocada. A anterior já não confere nenhum token." };
}
