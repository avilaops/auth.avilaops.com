import { randomBytes } from "crypto";
import { buscarConta, buscarContaPorEmail, criarConta, definirSenha, type Conta } from "@/lib/contas";
import { registrar } from "@/lib/eventos";
import { prisma } from "@/lib/prisma";
import type { PerfilExterno } from "@/lib/provedores";

/**
 * Cruzamento de identidades.
 *
 * A conta é sempre uma linha de `portal_clients` (uma por e-mail). O vínculo
 * diz "este id no Google/GitHub/… é aquela conta". Assim quem entra com senha
 * hoje e com Google amanhã é a mesma pessoa, com o mesmo histórico e as
 * mesmas permissões.
 */

export type ResultadoVinculo =
  | { ok: true; conta: Conta; novo: "nada" | "vinculo" | "conta" }
  | { ok: false; motivo: "sem_email" | "email_nao_verificado" | "vincule_primeiro" | "conta_inexistente" };

export async function listarVinculos(contaId: string) {
  return prisma.vinculo.findMany({ where: { contaId }, orderBy: { criadoEm: "asc" } });
}

/** Tira todos os logins sociais da conta. Para quando ela é removida. */
export async function desvincularTudo(contaId: string): Promise<void> {
  await prisma.vinculo.deleteMany({ where: { contaId } });
}

export async function desvincular(contaId: string, provedor: string): Promise<void> {
  await prisma.vinculo.deleteMany({ where: { contaId, provedor } });
}

async function tocar(vinculoId: string, perfil: PerfilExterno) {
  await prisma.vinculo.update({
    where: { id: vinculoId },
    data: { ultimoLogin: new Date(), email: perfil.email, nome: perfil.nome, foto: perfil.foto },
  });
}

/**
 * Resolve o perfil externo para uma conta, no login.
 *
 * Ordem:
 * 1. vínculo já existe → é essa conta;
 * 2. e-mail verificado bate com conta existente:
 *    - CLIENTE → vincula e entra;
 *    - ADMIN → recusa (`vincule_primeiro`): equipe vincula logada com senha,
 *      nunca por um provedor externo decidir sozinho que alguém é da casa;
 * 3. e-mail verificado sem conta → cria conta CLIENTE e vincula;
 * 4. sem e-mail verificado → recusa. Fundir contas por e-mail que o provedor não
 *    garante seria sequestro de conta.
 */
export async function resolverLogin(provedor: string, perfil: PerfilExterno, ip: string | null): Promise<ResultadoVinculo> {
  const existente = await prisma.vinculo.findUnique({
    where: { provedor_provedorUserId: { provedor, provedorUserId: perfil.id } },
  });
  if (existente) {
    const conta = await buscarConta(existente.contaId);
    if (!conta) {
      // Conta apagada no app; o vínculo ficou órfão. Limpa e trata como novo.
      await prisma.vinculo.delete({ where: { id: existente.id } });
    } else {
      await tocar(existente.id, perfil);
      return { ok: true, conta, novo: "nada" };
    }
  }

  if (!perfil.email) return { ok: false, motivo: "sem_email" };
  if (!perfil.emailVerificado) return { ok: false, motivo: "email_nao_verificado" };

  const porEmail = await buscarContaPorEmail(perfil.email);
  if (porEmail) {
    // Senha de caixa (ou login social) nao pode virar sessao da equipe. SOCIO
    // entrou aqui em 11/09/2026, quando a conta do Abraao passou a usar o
    // mesmo endereco da caixa dele: sem isto, a senha da caixa abriria o
    // painel da casa. OWNER continua de fora de proposito: fechar para o dono
    // pode tranca-lo fora do webmail, e isso e decisao dele, nao um ajuste.
    if (porEmail.role === "ADMIN" || porEmail.role === "SOCIO") return { ok: false, motivo: "vincule_primeiro" };
    await prisma.vinculo.create({
      data: { provedor, provedorUserId: perfil.id, contaId: porEmail.id, email: perfil.email, nome: perfil.nome, foto: perfil.foto, ultimoLogin: new Date() },
    });
    await registrar({ tipo: "vinculo_criado", email: porEmail.email, ip, detalhe: provedor, autor: porEmail.email });
    return { ok: true, conta: porEmail, novo: "vinculo" };
  }

  const { conta } = await criarConta({
    nome: perfil.nome ?? perfil.email.split("@")[0],
    email: perfil.email,
    role: "CLIENT",
  });
  // Conta social não tem senha conhecida: troca a provisória por uma aleatória
  // e marca como definida, para o login não exigir troca. Quem quiser senha
  // pede um link de recuperação.
  await definirSenha(conta.id, randomBytes(24).toString("base64url"), false);
  await prisma.vinculo.create({
    data: { provedor, provedorUserId: perfil.id, contaId: conta.id, email: perfil.email, nome: perfil.nome, foto: perfil.foto, ultimoLogin: new Date() },
  });
  await registrar({ tipo: "conta_criada", email: conta.email, ip, detalhe: `via ${provedor}`, autor: conta.email });
  return { ok: true, conta, novo: "conta" };
}

/**
 * Vincula um provedor à conta da sessão corrente (usuário logado, inclusive
 * ADMIN). Aqui o e-mail do provedor não precisa bater: a prova de posse é a
 * sessão, e o vínculo é uma decisão explícita da pessoa.
 */
export async function vincularNaSessao(provedor: string, perfil: PerfilExterno, contaId: string, ip: string | null): Promise<"ok" | "ja_usado"> {
  const conta = await buscarConta(contaId);
  if (!conta) throw new Error("conta da sessão não existe");

  const existente = await prisma.vinculo.findUnique({
    where: { provedor_provedorUserId: { provedor, provedorUserId: perfil.id } },
  });
  if (existente && existente.contaId !== contaId) return "ja_usado";
  if (existente) {
    await tocar(existente.id, perfil);
    return "ok";
  }
  await prisma.vinculo.create({
    data: { provedor, provedorUserId: perfil.id, contaId, email: perfil.email, nome: perfil.nome, foto: perfil.foto, ultimoLogin: new Date() },
  });
  await registrar({ tipo: "vinculo_criado", email: conta.email, ip, detalhe: provedor, autor: conta.email });
  return "ok";
}
