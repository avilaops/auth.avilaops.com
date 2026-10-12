/**
 * conta.avilaops.com: a página da própria conta no endereço que o mapa do
 * ecossistema dá a ela (o "myaccount" da casa).
 *
 * É o mesmo serviço do Auth atendendo em outro host. Aqui fica a regra do que
 * esse host mostra, pura, para ser testada sem servidor:
 *
 * - a raiz é a página da conta;
 * - `/conta…`, as rotas de API e os arquivos estáticos passam como estão (a
 *   página chama `/api/auth/…` por caminho relativo, e mandar isso para outro
 *   host quebraria a chamada);
 * - `/login` vai para o login do Auth pedindo a volta para cá;
 * - o resto (painel, OIDC, recuperação de senha) é do Auth e vai para lá, no
 *   mesmo caminho. Assim nenhuma tela de login ou de painel existe em dois
 *   endereços.
 */

export const HOST_DA_CONTA = "conta.avilaops.com";
export const ID_DO_APP_CONTA = "conta";

export type Decisao =
  | { tipo: "seguir" }
  | { tipo: "reescrever"; caminho: string }
  | { tipo: "redirecionar"; url: string };

/** O pedido chegou pelo endereço da conta? Ignora a porta e a caixa. */
export function ehHostDaConta(host: string | null | undefined): boolean {
  return (host ?? "").toLowerCase().split(":")[0] === HOST_DA_CONTA;
}

const PASSAM = ["/conta", "/api", "/_next"];

export function decidirNoHostDaConta(caminho: string, busca: string, baseDoAuth: string): Decisao {
  if (caminho === "/") return { tipo: "reescrever", caminho: "/conta" };
  if (PASSAM.some((p) => caminho === p || caminho.startsWith(`${p}/`))) return { tipo: "seguir" };
  // Arquivo de `public/` (ícones, marca): tem extensão no último trecho.
  if (/\.[a-z0-9]+$/i.test(caminho)) return { tipo: "seguir" };
  if (caminho === "/login") {
    const q = new URLSearchParams({ app: ID_DO_APP_CONTA, returnTo: `https://${HOST_DA_CONTA}/` });
    return { tipo: "redirecionar", url: `${baseDoAuth}/login?${q.toString()}` };
  }
  return { tipo: "redirecionar", url: `${baseDoAuth}${caminho}${busca}` };
}
