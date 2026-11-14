const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function baseDoAuthLocal(env: Record<string, string | undefined> = process.env): string | null {
  if (env.NODE_ENV !== "development" || env.AUTH_EMAIL_LOCAL !== "1") return null;
  try {
    const url = new URL(env.SSO_BASE_URL ?? "");
    return url.protocol === "http:" && LOOPBACK.has(url.hostname) && !url.username && !url.password
      && url.pathname === "/" && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}

/** Produção sempre HTTPS. HTTP só entre serviços loopback do DEV explicitamente isolado. */
export function baseDaAplicacao(host: string, env: Record<string, string | undefined> = process.env): string {
  if (baseDoAuthLocal(env)) {
    try {
      const url = new URL(`http://${host}/`);
      if (LOOPBACK.has(url.hostname) && url.host === host && !url.username && !url.password && url.pathname === "/") return url.href;
    } catch { /* A validação do cadastro continua sendo a autoridade para hosts. */ }
  }
  return `https://${host}/`;
}
