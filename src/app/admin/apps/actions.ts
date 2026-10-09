"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdminAction } from "@/lib/admin";
import { validarCadastro, type Cadastro, type EntradaCadastro } from "@/lib/apps";
import { atualizarCadastro, buscarCadastro, criarCadastro, jaExiste, removerCadastro } from "@/lib/cadastro";
import { empresasDasAplicacoes, listarEmpresas, vincularEmpresaDaAplicacao } from "@/lib/empresas";
import { registrar } from "@/lib/eventos";
import { integracoesDoApp } from "@/lib/clientesOidc";
import type { Resultado } from "../actions";

/**
 * Mutations do cadastro de aplicações. Mesma regra do resto do painel: sessão
 * de admin com segundo fator, e rastro em `eventos` de tudo o que muda — é o
 * que substitui a revisão em diff de quando a lista era código.
 */

function texto(fd: FormData, campo: string): string {
  const v = fd.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

function marcado(fd: FormData, campo: string): boolean {
  return fd.get(campo) === "on";
}

function lerFormulario(fd: FormData, id: string): EntradaCadastro {
  return {
    id,
    host: texto(fd, "host"),
    nome: texto(fd, "nome"),
    tipo: texto(fd, "tipo"),
    login: marcado(fd, "login"),
    papelExigido: texto(fd, "papelExigido"),
    restrito: marcado(fd, "restrito"),
    exigeSegundoFator: marcado(fd, "exigeSegundoFator"),
    dicaDominioGoogle: texto(fd, "dicaDominioGoogle"),
    deepLink: texto(fd, "deepLink"),
    repositorio: texto(fd, "repositorio"),
    servidor: texto(fd, "servidor"),
    publicacao: texto(fd, "publicacao"),
    situacao: texto(fd, "situacao"),
    observacao: texto(fd, "observacao"),
  };
}

/** O que importa para quem lê a trilha: para onde vai sessão, e para quem. */
function resumo(c: Cadastro): string {
  const acesso = !c.login ? "sem login" : c.papelExigido ? "só equipe" : c.restrito ? "restrito" : "aberto";
  return `${c.host} · ${acesso} · ${c.situacao}`;
}

export async function acaoCriarAplicacao(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const v = validarCadastro(lerFormulario(fd, texto(fd, "id")));
  if (!v.ok) return { ok: false, erro: v.erro };
  const empresa = texto(fd, "empresa") || null;
  if (empresa && !(await listarEmpresas()).some((e) => e.id === empresa)) return { ok: false, erro: "Empresa não encontrada." };

  try {
    await criarCadastro(v.dados, admin.email);
    if (empresa) await vincularEmpresaDaAplicacao(v.dados.id, empresa);
  } catch (e) {
    if (jaExiste(e)) return { ok: false, erro: "Já existe cadastro com este identificador ou este endereço." };
    throw e;
  }
  await registrar({ tipo: "app_criado", appId: v.dados.id, autor: admin.email, detalhe: resumo(v.dados) });
  revalidatePath("/admin/apps");
  redirect(`/admin/apps/${v.dados.id}`);
}

export async function acaoSalvarAplicacao(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const atual = await buscarCadastro(texto(fd, "id"));
  if (!atual) return { ok: false, erro: "Cadastro não encontrado." };

  // O id vem da linha, não do formulário: ele não é editável.
  const v = validarCadastro(lerFormulario(fd, atual.id));
  if (!v.ok) return { ok: false, erro: v.erro };

  try {
    await atualizarCadastro(atual.id, v.dados, admin.email);
  } catch (e) {
    if (jaExiste(e)) return { ok: false, erro: "Outro cadastro já usa este endereço." };
    throw e;
  }
  await registrar({
    tipo: "app_alterado",
    appId: atual.id,
    autor: admin.email,
    detalhe: `${resumo(atual)} → ${resumo(v.dados)}`,
  });
  revalidatePath("/admin/apps");
  revalidatePath(`/admin/apps/${atual.id}`);
  return { ok: true, mensagem: "Salvo." };
}

export async function acaoRemoverAplicacao(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const atual = await buscarCadastro(texto(fd, "id"));
  if (!atual) return { ok: false, erro: "Cadastro não encontrado." };

  // Integração (cliente OIDC ou de API) aponta para um app daqui. Remover a
  // linha deixaria a integração sem regra de acesso (o `/oauth/authorize` passa
  // a recusar todo mundo). Quem quer tirar do ar muda a situação para desativado.
  const [integracao] = await integracoesDoApp(atual.id);
  if (integracao) {
    return { ok: false, erro: `${integracao.nome} é uma integração que depende deste cadastro. Mude a situação para "desativado" em vez de remover.` };
  }

  await removerCadastro(atual.id);
  await registrar({ tipo: "app_removido", appId: atual.id, autor: admin.email, detalhe: resumo(atual) });
  revalidatePath("/admin/apps");
  redirect("/admin/apps");
}

/**
 * Empresa responsável pela aplicação. Só organiza o painel: o login não lê
 * este campo, e salvar o cadastro da aplicação não mexe nele.
 */
export async function acaoVincularEmpresaDaAplicacao(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const id = texto(fd, "id");
  const empresa = texto(fd, "empresa") || null;
  if (!(await buscarCadastro(id))) return { ok: false, erro: "Aplicação não encontrada." };
  const [empresas, vinculos] = await Promise.all([listarEmpresas(), empresasDasAplicacoes()]);
  if (empresa && !empresas.some((e) => e.id === empresa)) return { ok: false, erro: "Empresa não encontrada." };
  const anterior = vinculos.get(id) ?? null;
  if (anterior === empresa) return { ok: true, mensagem: "Nada mudou." };
  const nome = (v: string | null) => (v ? (empresas.find((e) => e.id === v)?.nome ?? v) : "sem empresa");

  await vincularEmpresaDaAplicacao(id, empresa);
  await registrar({ tipo: "app_alterado", appId: id, autor: admin.email, detalhe: `empresa: ${nome(anterior)} → ${nome(empresa)}` });
  revalidatePath("/admin/apps");
  revalidatePath(`/admin/apps/${id}`);
  return { ok: true, mensagem: "Empresa salva." };
}
