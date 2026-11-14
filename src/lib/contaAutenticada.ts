import { buscarConta, papelDaRole, type Conta } from "@/lib/contas";
import { lerSessao, type Sessao } from "@/lib/sessao";

export function contaCorrespondeSessao(conta: Conta | null, sessao: Sessao): conta is Conta {
  return Boolean(conta?.ativa && conta.id === sessao.sub && conta.email.toLowerCase() === sessao.email.toLowerCase()
    && papelDaRole(conta.role) === sessao.papel);
}

export async function lerContaAutenticada() {
  const sessao = await lerSessao();
  if (!sessao) return { tipo: "anonima" as const };
  const conta = await buscarConta(sessao.sub);
  if (!contaCorrespondeSessao(conta, sessao)) return { tipo: "invalida" as const };
  return { tipo: "autenticada" as const, conta, sessao: { ...sessao, nome: conta.nome, email: conta.email } };
}
