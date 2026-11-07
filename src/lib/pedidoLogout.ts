import { returnToSeguro } from "@/lib/apps";
import { buscarApp } from "@/lib/cadastro";
import { HOST_DA_CONTA, HOST_DO_AUTH } from "@/lib/hostDaConta";
import { buscarCliente, postLogoutRedirectUriValido } from "@/lib/oidc";
import { baseUrl, urlAbsoluta } from "@/lib/urls";

export const PARAMETROS_LOGOUT = ["client_id", "post_logout_redirect_uri", "state", "app", "returnTo"] as const;
const LIMITE_CORPO_BYTES = 8192;

export class PedidoLogoutInvalido extends Error {}

/** Parâmetros desconhecidos não são propagados à confirmação nem ao retorno. */
export function normalizarPedidoLogout(entrada: URLSearchParams): URLSearchParams {
  if (entrada.has("id_token_hint")) {
    throw new PedidoLogoutInvalido("id_token_hint ainda não é aceito. Inicie a saída sem esse parâmetro.");
  }
  const pedido = new URLSearchParams();
  for (const nome of PARAMETROS_LOGOUT) {
    const valores = entrada.getAll(nome);
    if (valores.length > 1 || (valores[0]?.length ?? 0) > 2048) {
      throw new PedidoLogoutInvalido("Parâmetros de saída inválidos ou repetidos.");
    }
    if (valores.length) pedido.set(nome, valores[0]);
  }
  return pedido;
}

/** POST OIDC aceita form serialization; a leitura é limitada mesmo sem Content-Length. */
export async function lerPedidoLogout(req: Request): Promise<URLSearchParams> {
  const entrada = new URL(req.url).searchParams;
  if (req.method === "POST" && req.body) {
    if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") {
      throw new PedidoLogoutInvalido("Use um formulário application/x-www-form-urlencoded.");
    }
    const leitor = req.body.getReader();
    const decoder = new TextDecoder();
    let tamanho = 0;
    let corpo = "";
    try {
      while (true) {
        const { done, value } = await leitor.read();
        if (done) break;
        tamanho += value.byteLength;
        if (tamanho > LIMITE_CORPO_BYTES) {
          await leitor.cancel();
          throw new PedidoLogoutInvalido("Formulário de saída muito grande.");
        }
        corpo += decoder.decode(value, { stream: true });
      }
      corpo += decoder.decode();
    } finally {
      leitor.releaseLock();
    }
    for (const [nome, valor] of new URLSearchParams(corpo)) entrada.append(nome, valor);
  }
  return normalizarPedidoLogout(entrada);
}

/** Só formulários do próprio serviço executam efeitos; outros passam pela confirmação. */
export function origemLocalDoLogout(origin: string | null): boolean {
  const origemAuth = new URL(baseUrl()).origin;
  return origin === origemAuth || (
    origemAuth === `https://${HOST_DO_AUTH}` && origin === `https://${HOST_DA_CONTA}`
  );
}

/** Deve resolver antes de apagar cookie, revogar tokens ou emitir eventos. */
export async function destinoDoLogout(pedido: URLSearchParams): Promise<string> {
  if (pedido.has("client_id") || pedido.has("post_logout_redirect_uri")) {
    const cliente = await buscarCliente(pedido.get("client_id"));
    if (!cliente) throw new PedidoLogoutInvalido("Cliente de saída desconhecido ou desativado.");
    if (!pedido.has("post_logout_redirect_uri")) return urlAbsoluta("/login");
    const retorno = pedido.get("post_logout_redirect_uri");
    if (!postLogoutRedirectUriValido(cliente, retorno)) {
      throw new PedidoLogoutInvalido("Destino de saída não autorizado para este cliente.");
    }
    const destino = new URL(retorno!);
    if (pedido.has("state")) destino.searchParams.set("state", pedido.get("state")!);
    return destino.toString();
  }
  if (!pedido.has("app")) return urlAbsoluta("/login");
  const app = await buscarApp(pedido.get("app"));
  if (!app) throw new PedidoLogoutInvalido("Aplicação de saída desconhecida ou desativada.");
  return returnToSeguro(pedido.get("returnTo"), app);
}
