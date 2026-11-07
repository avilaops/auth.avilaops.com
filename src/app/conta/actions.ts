"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { atualizarConta } from "@/lib/contas";
import { registrar } from "@/lib/eventos";
import { lerSessao } from "@/lib/sessao";
import { desvincular } from "@/lib/vinculos";

/**
 * O próprio usuário edita nome e telefone. E-mail, CPF e papel não entram aqui
 * de propósito: mudar o e-mail mexe na identidade (e-mail é a chave de login e
 * de vínculo com a caixa); papel é decisão da equipe, no painel.
 */
export async function acaoMeusDados(fd: FormData): Promise<void> {
  const sessao = await lerSessao();
  if (!sessao) throw new Error("Sessão expirada");
  const nome = (fd.get("nome") ?? "").toString().trim();
  const telefone = (fd.get("telefone") ?? "").toString().trim();
  if (!nome) redirect("/conta?secao=dados&erro=dados");
  let salvo = false;
  try {
    const conta = await atualizarConta(sessao.sub, { nome, telefone: telefone || null });
    salvo = Boolean(conta);
  } catch (erro) {
    console.error("[conta] Falha ao salvar dados do usuário", erro);
  }
  if (!salvo) redirect("/conta?secao=dados&erro=dados");
  try {
    await registrar({ tipo: "conta_editada", email: sessao.email, autor: sessao.email, detalhe: "dados pelo próprio" });
  } catch (erro) {
    // A falha no registro de auditoria não deve ocultar um cadastro já salvo.
    console.error("[conta] Dados salvos, mas auditoria falhou", erro);
  }
  revalidatePath("/conta");
  redirect("/conta?secao=dados&salvo=1");
}

export async function acaoDesvincular(fd: FormData): Promise<void> {
  const sessao = await lerSessao();
  if (!sessao) throw new Error("Sessão expirada");
  const provedor = fd.get("provedor");
  if (typeof provedor !== "string" || !provedor) return;
  await desvincular(sessao.sub, provedor);
  await registrar({ tipo: "vinculo_removido", email: sessao.email, detalhe: provedor, autor: sessao.email });
  revalidatePath("/conta");
}
