import { ehDaCasa, type Role } from "@/lib/contas";

/**
 * O que acontece, de verdade, quando uma conta é ligada a uma empresa.
 *
 * Três coisas diferentes costumam ser chamadas de "empresa da conta":
 *
 * - **papel** (`portal_clients.role`): o que a pessoa é na plataforma;
 * - **vínculo organizacional** (`portal_clients.organization_id`): a empresa que
 *   a conta representa;
 * - **autorização**: em quais dados e aplicações ela entra.
 *
 * O vínculo **não é só organizacional**. No banco do app.avilaops.com, um
 * gatilho (`core.mirror_portal_identity`) transforma o `organization_id` de uma
 * conta de cliente numa participação em `core.memberships`, e é essa
 * participação que o app consulta (`core.can_access_organization`) para abrir
 * os dados da empresa no portal. Ligar a conta à empresa concede acesso; tirar
 * o vínculo revoga.
 *
 * Por isso o painel não trata essa associação como etiqueta: mostra o efeito
 * antes e exige confirmação. Esta função é a descrição única desse efeito,
 * usada pela tela e pela ação, e testada.
 */
export type EfeitoDoVinculo = {
  /** Gravar o vínculo dá acesso aos dados da empresa no portal? */
  concedeAcesso: boolean;
  /** Papel que a conta passa a ter dentro da empresa. */
  papelNaEmpresa: "administrador" | "membro" | null;
  /** A participação nasce suspensa (conta desligada). */
  suspensa: boolean;
  descricao: string;
};

export function efeitoDoVinculo(role: Role, ativa: boolean): EfeitoDoVinculo {
  if (ehDaCasa(role)) {
    return {
      concedeAcesso: false,
      papelNaEmpresa: null,
      suspensa: false,
      descricao: "Conta da equipe Avila Ops: o vínculo fica gravado, mas não cria participação em empresa. A equipe já opera pelo painel da plataforma.",
    };
  }
  const papelNaEmpresa = role === "ADMIN" ? "administrador" : "membro";
  return {
    concedeAcesso: true,
    papelNaEmpresa,
    suspensa: !ativa,
    descricao: ativa
      ? `Dá a esta conta acesso aos dados da empresa no portal do app.avilaops.com, como ${papelNaEmpresa}.`
      : `Cria a participação como ${papelNaEmpresa}, suspensa enquanto a conta estiver desligada. Religar a conta ativa o acesso.`,
  };
}

/**
 * A ação pode gravar? Mudança que concede ou revoga acesso só passa com a
 * confirmação marcada na tela.
 */
export function vinculoPrecisaDeConfirmacao(role: Role, antes: string | null, depois: string | null): boolean {
  if (antes === depois) return false;
  return !ehDaCasa(role);
}
