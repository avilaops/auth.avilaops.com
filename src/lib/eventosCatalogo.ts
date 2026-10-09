/**
 * Como cada evento da auditoria aparece para quem lê: nome, resultado e se é
 * algo que a própria conta fez ou que alguém fez a ela.
 *
 * O código gravado no banco (`login_ok`, `conector_alterado`) continua visível
 * nos detalhes, para quem for procurar no log. Tipo novo sem entrada aqui
 * aparece com o próprio código e resultado "Informativo".
 */

export type Resultado = "sucesso" | "falha" | "atencao" | "informativo";

export const ROTULO_RESULTADO: Record<Resultado, string> = {
  sucesso: "Sucesso",
  falha: "Falha",
  atencao: "Requer atenção",
  informativo: "Informativo",
};

type Entrada = { rotulo: string; resultado: Resultado; /** A conta do evento é quem agiu (login, troca da própria senha). */ proprio?: boolean };

export const EVENTOS: Record<string, Entrada> = {
  login_ok: { rotulo: "Entrou", resultado: "sucesso", proprio: true },
  login_falhou: { rotulo: "Login falhou", resultado: "falha", proprio: true },
  login_sem_permissao: { rotulo: "Login sem permissão", resultado: "atencao", proprio: true },
  logout: { rotulo: "Saiu", resultado: "informativo", proprio: true },
  senha_trocada: { rotulo: "Trocou a senha", resultado: "informativo", proprio: true },
  senha_redefinida: { rotulo: "Senha redefinida", resultado: "atencao" },
  recuperacao_emitida: { rotulo: "Link de recuperação emitido", resultado: "informativo" },
  recuperacao_usada: { rotulo: "Link de recuperação usado", resultado: "informativo", proprio: true },
  convite_enviado: { rotulo: "Convite enviado por e-mail", resultado: "sucesso" },
  convite_nao_enviado: { rotulo: "Convite não enviado", resultado: "atencao" },
  conta_criada: { rotulo: "Conta criada", resultado: "sucesso" },
  conta_editada: { rotulo: "Conta editada", resultado: "informativo" },
  conta_removida: { rotulo: "Conta removida", resultado: "atencao" },
  permissao_concedida: { rotulo: "Permissão concedida", resultado: "sucesso" },
  permissao_revogada: { rotulo: "Permissão revogada", resultado: "atencao" },
  vinculo_criado: { rotulo: "Login social vinculado", resultado: "informativo", proprio: true },
  vinculo_removido: { rotulo: "Login social desvinculado", resultado: "informativo" },
  conector_alterado: { rotulo: "Conector alterado", resultado: "informativo" },
  app_criado: { rotulo: "Aplicação criada", resultado: "informativo" },
  app_alterado: { rotulo: "Aplicação alterada", resultado: "informativo" },
  app_removido: { rotulo: "Aplicação removida", resultado: "atencao" },
  meta_conectada: { rotulo: "Meta conectada", resultado: "sucesso", proprio: true },
  meta_desconectada: { rotulo: "Meta desconectada", resultado: "informativo", proprio: true },
  meta_falhou: { rotulo: "Conexão com a Meta falhou", resultado: "falha", proprio: true },
  meta_dados_excluidos: { rotulo: "Dados da Meta excluídos", resultado: "atencao" },
  meta_token_entregue: { rotulo: "Token da Meta entregue a um sistema", resultado: "atencao" },
  meta_token_renovado: { rotulo: "Token da Meta renovado", resultado: "informativo" },
  integracao_criada: { rotulo: "Integração criada", resultado: "informativo" },
  integracao_alterada: { rotulo: "Integração alterada", resultado: "informativo" },
  integracao_segredo_trocado: { rotulo: "Segredo de integração trocado", resultado: "atencao" },
  integracao_removida: { rotulo: "Integração removida", resultado: "atencao" },
  caixa_criada: { rotulo: "Caixa de e-mail criada", resultado: "sucesso" },
  caixa_falhou: { rotulo: "Caixa de e-mail falhou", resultado: "falha" },
  mfa_ativado: { rotulo: "2FA ativada", resultado: "sucesso", proprio: true },
  mfa_desativado: { rotulo: "2FA desativada", resultado: "atencao" },
  mfa_resetado: { rotulo: "2FA redefinida", resultado: "atencao" },
  mfa_desafiado: { rotulo: "2FA pedida", resultado: "informativo", proprio: true },
  mfa_cadastro_exigido: { rotulo: "Cadastro de 2FA exigido", resultado: "informativo", proprio: true },
  mfa_ok: { rotulo: "2FA conferida", resultado: "sucesso", proprio: true },
  mfa_falhou: { rotulo: "2FA falhou", resultado: "falha", proprio: true },
  mfa_backup_usado: { rotulo: "Código de recuperação usado", resultado: "atencao", proprio: true },
  mfa_codigos_gerados: { rotulo: "Códigos de recuperação gerados", resultado: "informativo", proprio: true },
  mfa_indisponivel: { rotulo: "2FA indisponível", resultado: "falha" },
};

export function descreverEvento(tipo: string): Entrada {
  return EVENTOS[tipo] ?? { rotulo: tipo, resultado: "informativo" };
}

export function tiposDoResultado(resultados: string[]): string[] {
  return Object.entries(EVENTOS).filter(([, e]) => resultados.includes(e.resultado)).map(([tipo]) => tipo);
}

export type EventoBruto = { tipo: string; email: string | null; autor: string | null };

/**
 * Quem fez e quem sofreu a ação, sem inventar.
 *
 * `autor` é quem agiu, quando o evento registra. `email` é a conta do evento.
 * Num login, a conta é a própria autora; numa redefinição de senha feita pelo
 * painel, a conta é o alvo e o autor é outra pessoa. Quando o evento não diz
 * quem fez e não é uma ação da própria conta, o autor fica em branco em vez de
 * ser preenchido com o alvo.
 */
export function autorEAlvo(e: EventoBruto): { autor: string | null; alvo: string | null; proprio: boolean } {
  const proprio = Boolean(descreverEvento(e.tipo).proprio);
  if (e.autor && e.autor !== e.email) return { autor: e.autor, alvo: e.email, proprio: false };
  if (e.autor) return { autor: e.autor, alvo: null, proprio: true };
  if (proprio) return { autor: e.email, alvo: null, proprio: true };
  return { autor: null, alvo: e.email, proprio: false };
}
