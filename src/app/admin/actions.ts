"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdminAction } from "@/lib/admin";
import { dominiosHospedados } from "@/lib/caixaEmail";
import { provisionarCaixa, usuarioDeCaixaValido } from "@/lib/caixaN8n";
import {
  atualizarConta,
  buscarConta,
  criarConta,
  definirSenha,
  gerarSenhaProvisoria,
  papelValido,
  redefinirSenhaProvisoria,
  removerConta,
  type Conta,
  type Role,
} from "@/lib/contas";
import { registrar } from "@/lib/eventos";
import { concederPermissao, revogarPermissao } from "@/lib/permissoes";
import { emitirLinkRecuperacao } from "@/lib/recuperacao";
import { desativar as desativarSegundoFator } from "@/lib/segundoFator";
import { desvincular } from "@/lib/vinculos";

/**
 * Mutations do painel. Toda ação exige sessão de admin e deixa rastro em
 * `eventos`. O que devolve segredo (senha provisória, link de recuperação)
 * devolve em claro uma vez — não fica salvo em lugar nenhum.
 */

export type Resultado = { ok: true; segredo?: string; mensagem?: string } | { ok: false; erro: string };

function texto(fd: FormData, campo: string): string {
  const v = fd.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * O papel vem de um `<select>` e é conferido contra a lista real.
 *
 * Isto era `v === "ADMIN" ? "ADMIN" : "CLIENT"`, o que rebaixava a conta da
 * plataforma a cliente no primeiro "Salvar" do painel.
 */
const roleValida = papelValido;

/**
 * Lê e valida o pedido de caixa que vem junto do formulário (`caixaDominio` +
 * `caixaUsuario`). Vazio = não criar. Domínio precisa estar hospedado no
 * avila-mail — a lista do select vem de lá, mas o POST pode ser forjado.
 */
async function pedidoDeCaixa(
  fd: FormData,
  emailDaConta: string,
): Promise<{ dominio: string; usuario: string } | null | { erro: string }> {
  const dominio = texto(fd, "caixaDominio").toLowerCase();
  if (!dominio) return null;

  let usuario = (texto(fd, "caixaUsuario") || emailDaConta.split("@")[0]).toLowerCase();
  // O campo pede a parte antes do @, mas o endereço inteiro é o que vem à
  // cabeça de quem digita. Colar "news@avilaops.com" com o mesmo domínio
  // selecionado é intenção clara: aceitar em vez de recusar por formalidade.
  if (usuario.includes("@")) {
    const [local, dominioDigitado] = usuario.split("@");
    if (dominioDigitado !== dominio) {
      return {
        erro: `A caixa é @${dominio}, mas você digitou @${dominioDigitado}. Deixe só a parte antes do @, ou troque o domínio no campo acima.`,
      };
    }
    usuario = local;
  }

  if (!usuarioDeCaixaValido(usuario)) {
    return { erro: `Usuário de caixa inválido: "${usuario}". Use letras, números, ponto, hífen ou sublinhado.` };
  }
  const hospedados = await dominiosHospedados();
  if (!hospedados.includes(dominio)) return { erro: `O domínio ${dominio} não está hospedado no Avila Mail.` };
  return { dominio, usuario };
}

/**
 * Cria a caixa pelo n8n e deixa o rastro em `eventos`, sucesso ou falha. A
 * conta vira dona da caixa (abre pelo login único); o aviso de boas-vindas vai
 * para o e-mail da conta quando ele é outro endereço.
 */
async function criarCaixaDaConta(p: {
  conta: Conta;
  dominio: string;
  usuario: string;
  senha: string;
  autor: string;
}): Promise<{ ok: true; address: string } | { ok: false; erro: string }> {
  const address = `${p.usuario}@${p.dominio}`;
  const r = await provisionarCaixa({
    domain: p.dominio,
    username: p.usuario,
    password: p.senha,
    displayName: p.conta.nome,
    ownerEmail: p.conta.email,
    notifyTo: p.conta.email !== address ? p.conta.email : undefined,
    autor: p.autor,
  });
  if (r.ok) {
    await registrar({ tipo: "caixa_criada", email: p.conta.email, autor: p.autor, detalhe: r.address });
    return { ok: true, address: r.address };
  }
  await registrar({ tipo: "caixa_falhou", email: p.conta.email, autor: p.autor, detalhe: `${address}: ${r.erro}` });
  return { ok: false, erro: r.erro };
}

/**
 * Reset do segundo fator: celular perdido, códigos de recuperação perdidos
 * junto, ninguém entra mais.
 *
 * É o único caminho que remove o fator sem apresentar um código — e por isso é
 * o que exige mais cuidado humano: confirme por um canal que não seja o
 * e-mail, que é justamente o que um invasor teria. O rastro fica em `eventos`
 * com o autor, e a conta volta a ser obrigada a cadastrar no próximo login.
 */
export async function acaoResetarMfa(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const id = texto(fd, "id");
  const conta = await buscarConta(id);
  if (!conta) return { ok: false, erro: "Conta não encontrada." };

  const tinha = await desativarSegundoFator(conta.email);
  if (!tinha) return { ok: false, erro: "Esta conta não tem verificação em duas etapas." };

  await registrar({ tipo: "mfa_resetado", email: conta.email, autor: admin.email, detalhe: "reset pelo painel" });
  revalidatePath(`/admin/contas/${id}`);
  return { ok: true, mensagem: "Verificação removida. A pessoa cadastra um aparelho novo no próximo login." };
}

export async function acaoCriarConta(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const nome = texto(fd, "nome");
  const email = texto(fd, "email");
  if (!nome || !email.includes("@")) return { ok: false, erro: "Nome e e-mail válido são obrigatórios." };

  // Valida a caixa ANTES de criar a conta: erro de formulário não pode deixar
  // uma conta pela metade.
  const caixa = await pedidoDeCaixa(fd, email);
  if (caixa && "erro" in caixa) return { ok: false, erro: caixa.erro };

  let conta: Conta;
  let senha: string;
  try {
    ({ conta, senha } = await criarConta({
      nome,
      email,
      cpf: texto(fd, "cpf") || null,
      telefone: texto(fd, "telefone") || null,
      role: roleValida(texto(fd, "role")),
    }));
    await registrar({ tipo: "conta_criada", email: conta.email, autor: admin.email, detalhe: conta.role });
    revalidatePath("/admin");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, erro: msg.includes("unique") || msg.includes("duplicate") ? "Já existe conta com esse e-mail ou CPF." : msg };
  }

  if (!caixa) return { ok: true, segredo: senha, mensagem: `Conta criada. Senha provisória de ${conta.email}:` };

  // Mesma senha provisória para conta e caixa: uma credencial para entregar,
  // e as duas exigem troca no primeiro acesso.
  const r = await criarCaixaDaConta({ conta, dominio: caixa.dominio, usuario: caixa.usuario, senha, autor: admin.email });
  return r.ok
    ? {
        ok: true,
        segredo: senha,
        mensagem: `Conta criada e caixa ${r.address} pronta (mesma senha; troca obrigatória no primeiro acesso). Senha provisória de ${conta.email}:`,
      }
    : {
        ok: true,
        segredo: senha,
        mensagem: `Conta criada, mas a caixa ${caixa.usuario}@${caixa.dominio} NÃO foi criada: ${r.erro}. Dá para tentar de novo na página da conta. Senha provisória de ${conta.email}:`,
      };
}

/** Caixa para conta que já existe (página da conta). Senha própria, gerada aqui. */
export async function acaoCriarCaixa(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const conta = await buscarConta(texto(fd, "id"));
  if (!conta) return { ok: false, erro: "Conta não encontrada." };

  const caixa = await pedidoDeCaixa(fd, conta.email);
  if (!caixa) return { ok: false, erro: "Escolha o domínio da caixa." };
  if ("erro" in caixa) return { ok: false, erro: caixa.erro };

  const senha = gerarSenhaProvisoria();
  const r = await criarCaixaDaConta({ conta, dominio: caixa.dominio, usuario: caixa.usuario, senha, autor: admin.email });
  revalidatePath(`/admin/contas/${conta.id}`);
  if (!r.ok) return { ok: false, erro: `Caixa não criada: ${r.erro}` };
  return { ok: true, segredo: senha, mensagem: `Caixa ${r.address} criada. Senha provisória da caixa (troca obrigatória no primeiro acesso):` };
}

export async function acaoEditarConta(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const id = texto(fd, "id");
  const antes = await buscarConta(id);
  if (!antes) return { ok: false, erro: "Conta não encontrada." };

  const role = roleValida(texto(fd, "role"));
  if (antes.email === admin.email && role !== "ADMIN") {
    return { ok: false, erro: "Você não pode rebaixar a própria conta." };
  }

  try {
    const conta = await atualizarConta(id, {
      nome: texto(fd, "nome"),
      email: texto(fd, "email"),
      cpf: texto(fd, "cpf") || null,
      telefone: texto(fd, "telefone") || null,
      role,
    });
    await registrar({
      tipo: "conta_editada",
      email: conta?.email ?? antes.email,
      autor: admin.email,
      detalhe: antes.role !== role ? `role ${antes.role} → ${role}` : null,
    });
    revalidatePath("/admin");
    revalidatePath(`/admin/contas/${id}`);
    return { ok: true, mensagem: "Salvo." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, erro: msg.includes("duplicate") ? "E-mail ou CPF já usado por outra conta." : msg };
  }
}

export async function acaoDefinirSenha(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const id = texto(fd, "id");
  const senha = texto(fd, "senha");
  const conta = await buscarConta(id);
  if (!conta) return { ok: false, erro: "Conta não encontrada." };
  if (senha.length < 8) return { ok: false, erro: "Mínimo de 8 caracteres." };

  await definirSenha(id, senha, fd.get("provisoria") === "on");
  await registrar({ tipo: "senha_redefinida", email: conta.email, autor: admin.email, detalhe: "definida pelo admin" });
  revalidatePath(`/admin/contas/${id}`);
  return { ok: true, mensagem: "Senha definida." };
}

export async function acaoGerarProvisoria(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const id = texto(fd, "id");
  const conta = await buscarConta(id);
  if (!conta) return { ok: false, erro: "Conta não encontrada." };

  const senha = await redefinirSenhaProvisoria(id);
  await registrar({ tipo: "senha_redefinida", email: conta.email, autor: admin.email, detalhe: "provisória gerada" });
  revalidatePath(`/admin/contas/${id}`);
  return { ok: true, segredo: senha, mensagem: "Senha provisória (o usuário troca no primeiro login):" };
}

export async function acaoLinkRecuperacao(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const conta = await buscarConta(texto(fd, "id"));
  if (!conta) return { ok: false, erro: "Conta não encontrada." };

  const link = await emitirLinkRecuperacao(conta.email);
  await registrar({ tipo: "recuperacao_emitida", email: conta.email, autor: admin.email });
  return { ok: true, segredo: link, mensagem: "Link de recuperação (vale 1 hora, uso único):" };
}

export async function acaoPermissao(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const conta = await buscarConta(texto(fd, "id"));
  const appId = texto(fd, "appId");
  const conceder = texto(fd, "acao") === "conceder";
  if (!conta || !appId) return { ok: false, erro: "Dados incompletos." };

  if (conceder) {
    await concederPermissao(conta.email, appId, admin.email);
    await registrar({ tipo: "permissao_concedida", email: conta.email, appId, autor: admin.email });
  } else {
    await revogarPermissao(conta.email, appId);
    await registrar({ tipo: "permissao_revogada", email: conta.email, appId, autor: admin.email });
  }
  revalidatePath(`/admin/contas/${conta.id}`);
  revalidatePath("/admin/apps");
  revalidatePath(`/admin/apps/${appId}`);
  return { ok: true, mensagem: conceder ? "Acesso concedido." : "Acesso revogado." };
}

export async function acaoDesvincularAdmin(fd: FormData): Promise<void> {
  const admin = await exigirAdminAction();
  const conta = await buscarConta(texto(fd, "id"));
  const provedor = texto(fd, "provedor");
  if (!conta || !provedor) return;
  await desvincular(conta.id, provedor);
  await registrar({ tipo: "vinculo_removido", email: conta.email, detalhe: provedor, autor: admin.email });
  revalidatePath(`/admin/contas/${conta.id}`);
}

export async function acaoRemoverConta(fd: FormData): Promise<void> {
  const admin = await exigirAdminAction();
  const id = texto(fd, "id");
  const conta = await buscarConta(id);
  if (!conta) redirect("/admin");
  if (conta.email === admin.email) throw new Error("Você não pode remover a própria conta.");

  await removerConta(id);
  await registrar({ tipo: "conta_removida", email: conta.email, autor: admin.email, detalhe: conta.nome });
  revalidatePath("/admin");
  redirect("/admin");
}
