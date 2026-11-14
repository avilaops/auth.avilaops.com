"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { atualizarConta } from "@/lib/contas";
import { registrar } from "@/lib/eventos";
import { lerContaAutenticada } from "@/lib/contaAutenticada";
import { revogarConexaoDaConta } from "@/lib/conexoesDaConta";
import { desvincular } from "@/lib/vinculos";
import { prepararFotoPerfil } from "@/lib/fotoPerfilImagem";
import { salvarFotoPerfil } from "@/lib/fotoPerfil";

async function exigirConta() {
  const atual = await lerContaAutenticada();
  if (atual.tipo === "anonima") redirect("/login?returnTo=/conta");
  if (atual.tipo !== "autenticada") redirect("/sair");
  return atual;
}

/**
 * O próprio usuário edita nome e telefone. E-mail, CPF e papel não entram aqui
 * de propósito: mudar o e-mail mexe na identidade (e-mail é a chave de login e
 * de vínculo com a caixa); papel é decisão da equipe, no painel.
 */
export async function acaoMeusDados(fd: FormData): Promise<void> {
  const { sessao } = await exigirConta();
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
  const { sessao } = await exigirConta();
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
  const { sessao } = await exigirConta();
  const provedor = fd.get("provedor");
  if (typeof provedor !== "string" || !provedor) return;
  await desvincular(sessao.sub, provedor);
  await registrar({ tipo: "vinculo_removido", email: sessao.email, detalhe: provedor, autor: sessao.email });
  revalidatePath("/conta");
}

export async function acaoRevogarConexao(fd: FormData): Promise<void> {
  const { conta } = await exigirConta();
  const id = fd.get("id");
  let revogada = false;
  if (typeof id === "string") {
    try { revogada = await revogarConexaoDaConta(conta.id, conta.email, id); } catch { /* Sem detalhes sensíveis na interface. */ }
  }
  if (!revogada) redirect("/conta?secao=conexoes&erro=conexao");
  revalidatePath("/conta");
  redirect("/conta?secao=conexoes&salvo=conexao");
}
