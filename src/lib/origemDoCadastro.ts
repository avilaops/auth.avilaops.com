import type { AppRegistrado } from "@/lib/apps";
import { buscarApp } from "@/lib/cadastro";
import { buscarCliente, redirectUriValido } from "@/lib/oidc";

export type OrigemDoCadastro = { app: string | null; returnTo: string | null };

/** Destino de navegação, nunca um callback com estado de autenticação antigo. */
function destinoDoProduto(app: AppRegistrado, valor: unknown): string {
  const inicio = `https://${app.host}/`;
  if (typeof valor !== "string" || valor.length > 2000 || /[\\\u0000-\u0020\u007f]/.test(valor)) return inicio;
  try {
    const url = new URL(valor);
    const caminho = decodeURIComponent(url.pathname);
    if (url.protocol !== "https:" || url.host !== app.host || url.username || url.password) return inicio;
    if (/[\\\u0000-\u0020\u007f%]/.test(caminho) || caminho.startsWith("//")) return inicio;
    if (/^\/(?:api|oauth|login|entrar|criar|criar-conta|recuperar)(?:\/|$)/i.test(caminho)) return inicio;
    if (["code", "state", "nonce", "code_challenge", "code_verifier", "access_token", "id_token"].some((chave) => url.searchParams.has(chave))) return inicio;
    url.hash = "";
    return url.toString();
  } catch { return inicio; }
}

/**
 * Normaliza a origem ANTES de emitir o e-mail e novamente ao confirmar.
 * OIDC pode ter começado em outra aba/navegador: guardamos somente o produto
 * registrado, que iniciará um fluxo novo com seu próprio state e PKCE.
 * Identificar o produto não concede acesso; login e produto revalidam isso.
 */
export async function origemDoCadastro(appId: unknown, returnTo: unknown): Promise<OrigemDoCadastro> {
  const semOrigem: OrigemDoCadastro = { app: null, returnTo: null };
  if (typeof appId === "string" && appId) {
    const app = await buscarApp(appId);
    return app ? { app: app.id, returnTo: destinoDoProduto(app, returnTo) } : semOrigem;
  }
  if (typeof returnTo !== "string" || returnTo.length > 2000 || !returnTo.startsWith("/oauth/authorize?") || /[\\\u0000-\u0020\u007f]/.test(returnTo)) return semOrigem;
  const url = new URL(returnTo, "https://auth.invalid");
  if (url.origin !== "https://auth.invalid" || url.pathname !== "/oauth/authorize" || url.hash) return semOrigem;
  const q = url.searchParams;
  if (q.getAll("client_id").length !== 1 || q.getAll("redirect_uri").length !== 1 || q.getAll("response_type").length > 1 || (q.get("response_type") ?? "code") !== "code") return semOrigem;
  const cliente = await buscarCliente(q.get("client_id"));
  if (!cliente || !redirectUriValido(cliente, q.get("redirect_uri"))) return semOrigem;
  const app = await buscarApp(cliente.appId);
  return app ? { app: app.id, returnTo: destinoDoProduto(app, null) } : semOrigem;
}
