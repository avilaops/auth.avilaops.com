/** Executado antes de qualquer escrita ou inicialização do servidor DEV. */
export function validarAmbienteLocal(env) {
  if (env.NODE_ENV !== "development") throw new Error("O ambiente local exige NODE_ENV=development.");
  const base = new URL(env.SSO_BASE_URL);
  if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || base.username || base.password
    || base.pathname !== "/" || base.search || base.hash) throw new Error("Use SSO_BASE_URL no loopback HTTP.");
  for (const [campo, banco] of [["DATABASE_URL", "avila_auth_dev"], ["PORTAL_DATABASE_URL", "avila_portal_dev"]]) {
    const url = new URL(env[campo]);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== "127.0.0.1"
      || url.pathname !== `/${banco}` || url.search || url.hash) throw new Error(`${campo} deve usar o banco DEV exclusivo no loopback.`);
  }
  if (env.SSO_COOKIE_DOMAIN || env.AUTH_EMAIL_LOCAL !== "1") throw new Error("Use cookie local e captura de e-mail DEV.");
  const externos = ["MAIL_DATABASE_URL", "LOJAS_DATABASE_URL", "N8N_CAIXA_WEBHOOK_TOKEN", "N8N_CAIXA_WEBHOOK_URL", "N8N_EMAIL_WEBHOOK_URL",
    "SMTP_HOST", "SMTP_USUARIO", "SMTP_SENHA", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "MCP_GATEWAY_CLIENT_ID"];
  if (externos.some((campo) => env[campo])) throw new Error("O ambiente DEV isolado não aceita integrações externas.");
}
