import { createHmac, timingSafeEqual } from "crypto";

/**
 * Cliente da Graph API da Meta para a **conexão de ativos** — não para o login.
 *
 * O login com Facebook (`provedores.ts`) pede só `email` e `public_profile` e
 * joga o token fora depois de ler o perfil. Aqui é outra conversa: a pessoa,
 * já logada, autoriza a casa a enxergar as Páginas, contas de anúncio, números
 * de WhatsApp e catálogos dela, e o token fica guardado (cifrado) para os
 * outros sistemas trabalharem.
 *
 * Este arquivo não toca no banco de propósito: é o protocolo e a tradução das
 * respostas. Quem grava é `conexaoMeta.ts`.
 */

export const VERSAO_GRAPH = "v21.0";
const GRAPH = `https://graph.facebook.com/${VERSAO_GRAPH}`;
const DIALOGO = `https://www.facebook.com/${VERSAO_GRAPH}/dialog/oauth`;

export type TipoAtivo = "pagina" | "instagram" | "negocio" | "conta_anuncio" | "whatsapp" | "catalogo";

export const TIPOS_ATIVO: readonly TipoAtivo[] = ["pagina", "instagram", "negocio", "conta_anuncio", "whatsapp", "catalogo"];

/**
 * O que cada permissão libera nesta tela. É também o roteiro da análise do app
 * na Meta: permissão que não aparece aqui não tem o que mostrar ao revisor.
 */
export const ESCOPOS_CONHECIDOS: Record<string, string> = {
  public_profile: "Seu nome e foto no Facebook",
  pages_show_list: "Ver a lista das Páginas que você administra",
  pages_read_engagement: "Ler seguidores e dados públicos das suas Páginas",
  instagram_basic: "Ver a conta do Instagram ligada a cada Página",
  business_management: "Ver os negócios (Business Manager) de que você participa",
  ads_read: "Ver suas contas de anúncio",
  whatsapp_business_management: "Ver suas contas e números do WhatsApp Business",
  catalog_management: "Ver seus catálogos de produtos",
};

/** Pedido quando o painel não define outra lista. */
export const ESCOPOS_PADRAO: readonly string[] = [
  "public_profile",
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "business_management",
  "ads_read",
  "whatsapp_business_management",
  "catalog_management",
];

/**
 * Lê a lista de escopos digitada no painel (espaço, vírgula ou quebra de linha).
 *
 * Nome de escopo da Meta é letra minúscula e sublinhado; o que não tiver essa
 * cara é descartado em vez de ir parar na URL do diálogo.
 */
export function lerEscopos(texto: string | null | undefined): string[] {
  const vistos = new Set<string>();
  for (const bruto of (texto ?? "").split(/[\s,]+/)) {
    const e = bruto.trim().toLowerCase();
    if (/^[a-z][a-z_]*$/.test(e)) vistos.add(e);
  }
  if (vistos.size === 0) return [...ESCOPOS_PADRAO];
  vistos.add("public_profile");
  return [...vistos];
}

export function urlConexao(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  escopos: readonly string[];
  /** Facebook Login para Empresas: a configuração do painel substitui `scope`. */
  configId?: string | null;
}): string {
  const url = new URL(DIALOGO);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", opts.state);
  if (opts.configId) url.searchParams.set("config_id", opts.configId);
  else url.searchParams.set("scope", opts.escopos.join(","));
  return url.toString();
}

/**
 * `appsecret_proof`: prova, a cada chamada, que quem usa o token é o dono do
 * app. Com "Exigir chave secreta do app" ligado no painel da Meta, um token
 * vazado sozinho não serve para nada.
 */
export function provaSegredo(token: string, segredo: string): string {
  return createHmac("sha256", segredo).update(token).digest("hex");
}

export type PedidoAssinado = { userId: string; emitidoEm: number | null };

/**
 * Confere e lê o `signed_request` que a Meta manda nos callbacks de exclusão
 * de dados e de desautorização.
 *
 * Formato: `<assinatura b64url>.<payload b64url>`, assinatura = HMAC-SHA256 do
 * payload **ainda codificado** com o segredo do app. Sem conferir, qualquer um
 * apagaria a conexão de qualquer pessoa só sabendo o id dela no Facebook.
 */
export function lerPedidoAssinado(bruto: string | null | undefined, segredo: string): PedidoAssinado | null {
  if (!bruto || !segredo) return null;
  const partes = bruto.split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return null;

  const recebida = Buffer.from(partes[0], "base64url");
  const esperada = createHmac("sha256", segredo).update(partes[1]).digest();
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) return null;

  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof dados.algorithm === "string" && dados.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
  if (typeof dados.user_id !== "string" || !dados.user_id) return null;
  return { userId: dados.user_id, emitidoEm: typeof dados.issued_at === "number" ? dados.issued_at : null };
}

export class ErroGraph extends Error {
  codigo: number | null;
  constructor(mensagem: string, codigo: number | null = null) {
    super(mensagem);
    this.name = "ErroGraph";
    this.codigo = codigo;
  }
}

export type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

type Acesso = { token: string; segredo: string; buscar?: Buscar };

async function ler<T>(url: string, buscar: Buscar, init?: RequestInit): Promise<T> {
  const r = await buscar(url, init);
  const dados = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
  if (!r.ok || dados.error) {
    throw new ErroGraph(dados.error?.message || `Graph HTTP ${r.status}`, dados.error?.code ?? null);
  }
  return dados as T;
}

function montar(caminho: string, params: Record<string, string>, a: Acesso): string {
  const url = new URL(`${GRAPH}${caminho}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", a.token);
  url.searchParams.set("appsecret_proof", provaSegredo(a.token, a.segredo));
  return url.toString();
}

export async function graph<T>(caminho: string, params: Record<string, string>, a: Acesso): Promise<T> {
  return ler<T>(montar(caminho, params, a), a.buscar ?? fetch);
}

/** Teto de páginas seguidas: quem tem mais de 500 Páginas não é o caso de uso. */
const MAX_PAGINAS = 5;

type Lista<T> = { data?: T[]; paging?: { next?: string } };

export async function graphLista<T>(caminho: string, params: Record<string, string>, a: Acesso): Promise<T[]> {
  const buscar = a.buscar ?? fetch;
  const itens: T[] = [];
  let url: string | undefined = montar(caminho, { limit: "100", ...params }, a);
  for (let i = 0; url && i < MAX_PAGINAS; i++) {
    const pagina: Lista<T> = await ler<Lista<T>>(url, buscar);
    itens.push(...(pagina.data ?? []));
    url = pagina.paging?.next;
  }
  return itens;
}

type RespostaToken = { access_token?: string; expires_in?: number };

export type TokenMeta = { token: string; expiraEm: Date | null };

function comoToken(r: RespostaToken): TokenMeta {
  if (!r.access_token) throw new ErroGraph("a Meta não devolveu o token");
  return { token: r.access_token, expiraEm: r.expires_in ? new Date(Date.now() + r.expires_in * 1000) : null };
}

/**
 * Troca o `code` por um token de longa duração (~60 dias).
 *
 * São duas chamadas: o `code` rende um token de poucas horas, e só esse token
 * pode ser trocado pelo longo. Guardar o curto faria a conexão "cair sozinha"
 * na mesma tarde.
 */
export async function trocarCodigoMeta(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  buscar?: Buscar;
}): Promise<TokenMeta> {
  const buscar = opts.buscar ?? fetch;
  const curta = new URL(`${GRAPH}/oauth/access_token`);
  curta.searchParams.set("client_id", opts.clientId);
  curta.searchParams.set("client_secret", opts.clientSecret);
  curta.searchParams.set("redirect_uri", opts.redirectUri);
  curta.searchParams.set("code", opts.code);
  const primeiro = comoToken(await ler<RespostaToken>(curta.toString(), buscar));

  const longa = new URL(`${GRAPH}/oauth/access_token`);
  longa.searchParams.set("grant_type", "fb_exchange_token");
  longa.searchParams.set("client_id", opts.clientId);
  longa.searchParams.set("client_secret", opts.clientSecret);
  longa.searchParams.set("fb_exchange_token", primeiro.token);
  return comoToken(await ler<RespostaToken>(longa.toString(), buscar));
}

/**
 * Troca um token de longa duração ainda válido por outro, com prazo novo.
 *
 * A Meta não tem refresh token para usuário: o que existe é repetir a troca
 * `fb_exchange_token` antes de vencer. Token já vencido não renova — aí só a
 * pessoa conectando de novo.
 */
export async function renovarTokenMeta(opts: { clientId: string; clientSecret: string; token: string; buscar?: Buscar }): Promise<TokenMeta> {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("client_secret", opts.clientSecret);
  url.searchParams.set("fb_exchange_token", opts.token);
  return comoToken(await ler<RespostaToken>(url.toString(), opts.buscar ?? fetch));
}
export async function perfilMeta(a: Acesso): Promise<{ id: string; nome: string | null }> {
  const d = await graph<{ id?: string; name?: string }>("/me", { fields: "id,name" }, a);
  if (!d.id) throw new ErroGraph("perfil sem id");
  return { id: d.id, nome: d.name ?? null };
}

/** O que a pessoa de fato concedeu — ela pode desmarcar itens no diálogo. */
export async function permissoesMeta(a: Acesso): Promise<{ concedidos: string[]; recusados: string[] }> {
  const linhas = await graphLista<{ permission?: string; status?: string }>("/me/permissions", {}, a);
  const concedidos: string[] = [];
  const recusados: string[] = [];
  for (const l of linhas) {
    if (!l.permission) continue;
    (l.status === "granted" ? concedidos : recusados).push(l.permission);
  }
  return { concedidos, recusados };
}

/** Revoga o app inteiro na conta da pessoa. O token deixa de valer na hora. */
export async function revogarMeta(a: Acesso): Promise<void> {
  await ler(montar("/me/permissions", {}, a), a.buscar ?? fetch, { method: "DELETE" });
}

export type AtivoColetado = {
  tipo: TipoAtivo;
  externoId: string;
  nome: string;
  detalhe: Record<string, string | number | boolean | null>;
  /** Token próprio do ativo (Página). Nunca vai para a tela. */
  token?: string;
};

/**
 * Resultado por tipo: a lista lida, ou `"falhou"` quando a Meta não respondeu.
 *
 * A distinção importa na hora de gravar: lista vazia apaga o que havia (a
 * pessoa perdeu o acesso ou tirou a permissão); falha mantém, porque uma
 * instabilidade da Graph não pode fazer sumir a Página de ninguém.
 */
export type Coleta = Record<TipoAtivo, AtivoColetado[] | "falhou">;

type PaginaGraph = {
  id: string;
  name?: string;
  category?: string;
  access_token?: string;
  tasks?: string[];
  fan_count?: number;
  followers_count?: number;
  instagram_business_account?: { id: string; username?: string; name?: string };
};
type NegocioGraph = { id: string; name?: string; verification_status?: string };
type ContaAnuncioGraph = { id: string; account_id?: string; name?: string; account_status?: number; currency?: string };
type WhatsappGraph = {
  id: string;
  name?: string;
  phone_numbers?: { data?: { id: string; display_phone_number?: string; verified_name?: string }[] };
};
type CatalogoGraph = { id: string; name?: string; product_count?: number };

async function tentar<T>(f: () => Promise<T[]>): Promise<T[] | "falhou"> {
  try {
    return await f();
  } catch (e) {
    console.error("[meta] coleta", e instanceof Error ? e.message : e);
    return "falhou";
  }
}

/**
 * Lê da Graph tudo o que as permissões concedidas alcançam.
 *
 * Só pede o que foi concedido: campo de permissão ausente derruba a chamada
 * inteira, e a Página deixaria de aparecer por causa do Instagram.
 */
export async function coletarAtivos(a: Acesso, concedidos: readonly string[]): Promise<Coleta> {
  const tem = (e: string) => concedidos.includes(e);
  const coleta: Coleta = { pagina: [], instagram: [], negocio: [], conta_anuncio: [], whatsapp: [], catalogo: [] };

  if (tem("pages_show_list")) {
    const campos = ["id", "name", "category", "access_token", "tasks"];
    if (tem("pages_read_engagement")) campos.push("fan_count", "followers_count");
    if (tem("instagram_basic")) campos.push("instagram_business_account{id,username,name}");
    const paginas = await tentar(() => graphLista<PaginaGraph>("/me/accounts", { fields: campos.join(",") }, a));
    if (paginas === "falhou") {
      coleta.pagina = "falhou";
      coleta.instagram = "falhou";
    } else {
      coleta.pagina = paginas.map((p) => ({
        tipo: "pagina",
        externoId: p.id,
        nome: p.name ?? p.id,
        detalhe: {
          categoria: p.category ?? null,
          seguidores: p.followers_count ?? p.fan_count ?? null,
          tarefas: (p.tasks ?? []).join(", ") || null,
        },
        token: p.access_token,
      }));
      coleta.instagram = paginas
        .filter((p) => p.instagram_business_account)
        .map((p) => ({
          tipo: "instagram",
          externoId: p.instagram_business_account!.id,
          nome: p.instagram_business_account!.username
            ? `@${p.instagram_business_account!.username}`
            : (p.instagram_business_account!.name ?? p.instagram_business_account!.id),
          detalhe: { pagina: p.name ?? p.id, paginaId: p.id },
        }));
    }
  }

  if (tem("ads_read") || tem("ads_management")) {
    const contas = await tentar(() =>
      graphLista<ContaAnuncioGraph>("/me/adaccounts", { fields: "id,account_id,name,account_status,currency" }, a),
    );
    coleta.conta_anuncio =
      contas === "falhou"
        ? "falhou"
        : contas.map((c) => ({
            tipo: "conta_anuncio",
            externoId: c.id,
            nome: c.name ?? c.account_id ?? c.id,
            detalhe: { moeda: c.currency ?? null, ativa: c.account_status === 1 },
          }));
  }

  if (tem("business_management")) {
    const negocios = await tentar(() => graphLista<NegocioGraph>("/me/businesses", { fields: "id,name,verification_status" }, a));
    if (negocios === "falhou") {
      coleta.negocio = "falhou";
      if (tem("whatsapp_business_management")) coleta.whatsapp = "falhou";
      if (tem("catalog_management")) coleta.catalogo = "falhou";
    } else {
      coleta.negocio = negocios.map((n) => ({
        tipo: "negocio",
        externoId: n.id,
        nome: n.name ?? n.id,
        detalhe: { verificacao: n.verification_status ?? null },
      }));

      if (tem("whatsapp_business_management")) {
        coleta.whatsapp = await tentar(async () => {
          const numeros: AtivoColetado[] = [];
          for (const n of negocios) {
            const contas = await graphLista<WhatsappGraph>(
              `/${n.id}/owned_whatsapp_business_accounts`,
              { fields: "id,name,phone_numbers{id,display_phone_number,verified_name}" },
              a,
            );
            for (const w of contas) {
              const telefones = w.phone_numbers?.data ?? [];
              numeros.push({
                tipo: "whatsapp",
                externoId: w.id,
                nome: w.name ?? w.id,
                detalhe: {
                  negocio: n.name ?? n.id,
                  numeros: telefones.map((t) => t.display_phone_number ?? t.id).join(", ") || null,
                  // O envio usa o id do número, não o da conta: sem ele o
                  // sistema de mensagens teria de perguntar tudo de novo.
                  numeroIds: telefones.map((t) => t.id).join(",") || null,
                },
              });
            }
          }
          return numeros;
        });
      }

      if (tem("catalog_management")) {
        coleta.catalogo = await tentar(async () => {
          const catalogos: AtivoColetado[] = [];
          for (const n of negocios) {
            const lista = await graphLista<CatalogoGraph>(`/${n.id}/owned_product_catalogs`, { fields: "id,name,product_count" }, a);
            for (const c of lista) {
              catalogos.push({
                tipo: "catalogo",
                externoId: c.id,
                nome: c.name ?? c.id,
                detalhe: { negocio: n.name ?? n.id, produtos: c.product_count ?? null },
              });
            }
          }
          return catalogos;
        });
      }
    }
  }

  return coleta;
}
