/**
 * Seções de `/conta`.
 *
 * A página era uma coluna só, com tudo empilhado. Agora cada seção é uma tela,
 * escolhida por `?secao=` para o endereço poder ser copiado e o botão de voltar
 * do navegador funcionar. Puro, para ser testado sem servidor.
 */
export const SECOES_DA_CONTA = [
  { id: "inicio", rotulo: "Início" },
  { id: "dados", rotulo: "Meus dados" },
  { id: "seguranca", rotulo: "Segurança" },
  { id: "empresas", rotulo: "Empresas" },
  { id: "conexoes", rotulo: "Conexões" },
] as const;

export type SecaoDaConta = (typeof SECOES_DA_CONTA)[number]["id"];

/**
 * A seção a mostrar. Valor desconhecido cai no início.
 *
 * Erro de vínculo com rede social (`?erro=`) abre a seção de segurança mesmo
 * sem `secao`: é para lá que o retorno do provedor manda a pessoa, e o aviso
 * precisa aparecer ao lado do que ela estava fazendo.
 */
export function secaoDaConta(secao: string | string[] | undefined, erro?: string | string[]): SecaoDaConta {
  const pedida = typeof secao === "string" ? SECOES_DA_CONTA.find((s) => s.id === secao)?.id : undefined;
  if (pedida) return pedida;
  return erro ? "seguranca" : "inicio";
}

export function enderecoDaSecao(secao: SecaoDaConta): string {
  return secao === "inicio" ? "/conta" : `/conta?secao=${secao}`;
}

/** Paginação recebida na URL nunca vira um offset arbitrário ou repetido. */
export function paginaDaConta(valor: unknown): number {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 1 && valor <= 10000 ? valor
    : typeof valor === "string" && /^[1-9]\d{0,4}$/.test(valor) && Number(valor) <= 10000 ? Number(valor) : 1;
}
