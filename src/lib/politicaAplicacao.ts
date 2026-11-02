import type { Cadastro } from "@/lib/apps";

export const MODOS_ACESSO = ["desativado", "equipe", "clientes_liberados", "qualquer_conta"] as const;
export type ModoAcesso = (typeof MODOS_ACESSO)[number];

export type PoliticaAcesso = {
  modoAcesso: ModoAcesso;
  exigeMfa: boolean;
  permiteCadastro: boolean;
  permiteRecuperacao: boolean;
  conviteObrigatorio: boolean;
  empresaObrigatoria: boolean;
};

/**
 * Projeção compatível da regra antiga para o contrato novo.
 *
 * Esta função não consulta banco e permite que o runtime e a migração sejam
 * testados sem fabricar uma sessão ou uma aplicação real.
 */
export function politicaLegada(c: Pick<Cadastro, "tipo" | "login" | "situacao" | "papelExigido" | "restrito" | "exigeSegundoFator">): PoliticaAcesso {
  const modoAcesso: ModoAcesso = !c.login || c.tipo !== "app" || c.situacao === "desativado"
    ? "desativado"
    : c.papelExigido === "ADMIN"
      ? "equipe"
      : c.restrito
        ? "clientes_liberados"
        : "qualquer_conta";

  return {
    modoAcesso,
    exigeMfa: c.exigeSegundoFator,
    permiteCadastro: true,
    permiteRecuperacao: true,
    conviteObrigatorio: false,
    empresaObrigatoria: false,
  };
}

export function modoAcessoConhecido(valor: string): valor is ModoAcesso {
  return (MODOS_ACESSO as readonly string[]).includes(valor);
}

/** Valores desconhecidos fecham o acesso, nunca o ampliam. */
export function normalizarPolitica(valor: Partial<PoliticaAcesso>): PoliticaAcesso {
  return {
    modoAcesso: valor.modoAcesso && modoAcessoConhecido(valor.modoAcesso) ? valor.modoAcesso : "desativado",
    exigeMfa: valor.exigeMfa === true,
    permiteCadastro: valor.permiteCadastro !== false,
    permiteRecuperacao: valor.permiteRecuperacao !== false,
    conviteObrigatorio: valor.conviteObrigatorio === true,
    empresaObrigatoria: valor.empresaObrigatoria === true,
  };
}
