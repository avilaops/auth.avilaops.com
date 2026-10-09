/**
 * Regras do convite que um sistema pede em `/api/provisionamento/acessos`.
 * Sem banco aqui: as rotas buscam os fatos e perguntam a estas funções.
 */

export type SituacaoDaConta = {
  /** A senha ainda é a provisória gerada na criação: a pessoa nunca escolheu uma. */
  senhaProvisoria: boolean;
  /** Nunca entrou. */
  ultimoAcessoEm: Date | null;
  /** `autor` do evento `conta_criada` desta conta ("app:erp", e-mail de quem criou no painel…). */
  criadaPor: string | null;
};

/**
 * O sistema pode receber de novo o endereço de criar senha?
 *
 * Só para a conta que **ele mesmo criou** e que a pessoa ainda não assumiu
 * (senha provisória, nunca entrou). Esse sistema já recebeu o primeiro
 * endereço; repetir não entrega nada que ele não teve. Para qualquer outra
 * conta continua valendo o "nunca": senão quem administra uma empresa no
 * sistema convidaria o e-mail de outra pessoa e trocaria a senha dela.
 */
export function podeReemitirConvite(conta: SituacaoDaConta, autor: string): boolean {
  return conta.senhaProvisoria && conta.ultimoAcessoEm === null && conta.criadaPor === autor;
}

/** A pessoa chegou por um convite e ainda vai escolher a primeira senha. */
export function ehPrimeiraSenha(conta: Pick<SituacaoDaConta, "senhaProvisoria" | "ultimoAcessoEm">): boolean {
  return conta.senhaProvisoria && conta.ultimoAcessoEm === null;
}
