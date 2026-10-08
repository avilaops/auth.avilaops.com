/**
 * Estado temporário do login social, guardado em cookie HttpOnly entre o
 * redirect para o provedor e a volta no callback.
 *
 * Fica aqui, e não no `route.ts`, porque arquivo de rota do App Router só pode
 * exportar os handlers e um punhado de opções conhecidas — qualquer export extra
 * quebra o build com "does not match the required types of a Next.js Route".
 */

export const COOKIE_FLUXO = "avila_oauth_fluxo";

/** 10 minutos: tempo de sobra para o consentimento sem deixar o estado vivo à toa. */
export const VALIDADE_FLUXO_SEGUNDOS = 10 * 60;

export type EstadoFluxo = {
  state: string;
  nonce: string;
  provedor: string;
  /** PKCE; vazio quando o provedor não usa */
  verifier: string;
  /** app do registro ou "" (login direto no auth) */
  appId: string;
  /** destino validado */
  returnTo: string;
  /** id da conta logada que pediu para vincular; "" no login normal */
  vincularConta: string;
};

export function lerEstadoFluxo(bruto: string | undefined): EstadoFluxo | null {
  if (!bruto) return null;
  try {
    const v = JSON.parse(bruto) as Partial<EstadoFluxo>;
    if (typeof v.state !== "string" || typeof v.nonce !== "string" || typeof v.provedor !== "string") return null;
    return {
      state: v.state,
      nonce: v.nonce,
      provedor: v.provedor,
      verifier: typeof v.verifier === "string" ? v.verifier : "",
      appId: typeof v.appId === "string" ? v.appId : "",
      returnTo: typeof v.returnTo === "string" ? v.returnTo : "",
      vincularConta: typeof v.vincularConta === "string" ? v.vincularConta : "",
    };
  } catch {
    return null;
  }
}
