"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { atualizarConta } from "@/lib/contas";
import { registrar } from "@/lib/eventos";
import { lerSessao } from "@/lib/sessao";
import { desvincular } from "@/lib/vinculos";
import { prepararFotoPerfil } from "@/lib/fotoPerfilImagem";
import { salvarFotoPerfil } from "@/lib/fotoPerfil";

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
  if (!nome || nome.length > 120 || telefone.length > 30) redirect("/conta?secao=dados&erro=dados");
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

export async function acaoFotoPerfil(fd: FormData): Promise<void> {
  const sessao = await lerSessao();
  if (!sessao) throw new Error("Sessão expirada");
  let ok = false;
  try {
    const remover = fd.get("remover") === "1";
    const arquivo = fd.get("foto");
    if (!remover && (!(arquivo instanceof File) || !arquivo.size)) redirect("/conta?secao=dados&erro=foto");
    const foto = remover ? null : await prepararFotoPerfil(new Uint8Array(await (arquivo as File).arrayBuffer()), (arquivo as File).type);
    ok = await salvarFotoPerfil(sessao.sub, foto);
  } catch {
    // Não registrar conteúdo da foto nem valores de formulário.
    ok = false;
  }
  if (!ok) redirect("/conta?secao=dados&erro=foto");
  try { await registrar({ tipo: "conta_editada", email: sessao.email, autor: sessao.email, detalhe: "foto pelo próprio" }); } catch { /* A foto já foi salva. */ }
  revalidatePath("/conta");
  redirect("/conta?secao=dados&salvo=foto");
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
