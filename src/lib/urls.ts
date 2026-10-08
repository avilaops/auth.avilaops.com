/**
 * Base pública do serviço.
 *
 * Nunca derivar redirect de `req.url`: atrás do proxy reverso ele carrega o host
 * interno (`localhost:3010`), e o `Location` sai apontando para a máquina do
 * próprio usuário. O host público só existe aqui, na configuração.
 */
export function baseUrl(): string {
  return (process.env.SSO_BASE_URL || "https://auth.avilaops.com").replace(/\/$/, "");
}

/** URL absoluta de um caminho interno, pronta para `Location`. */
export function urlAbsoluta(caminho: string): string {
  return `${baseUrl()}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;
}

export function urlErro(motivo: string): string {
  return urlAbsoluta(`/erro?motivo=${encodeURIComponent(motivo)}`);
}
