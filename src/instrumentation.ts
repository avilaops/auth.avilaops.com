/**
 * Roda uma vez quando o servidor sobe. Liga as rotinas do próprio processo.
 * Só no Node: o runtime de borda não tem banco nem temporizador de longa vida.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { iniciarRotinaDeConferencia } = await import("@/lib/rotinaDeConferencia");
  iniciarRotinaDeConferencia();
}
