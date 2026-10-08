"use server";

import { revalidatePath } from "next/cache";
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
  if (!nome) return;
  await atualizarConta(sessao.sub, { nome, telefone: telefone || null });
  await registrar({ tipo: "conta_editada", email: sessao.email, autor: sessao.email, detalhe: "dados pelo próprio" });
  revalidatePath("/conta");
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
