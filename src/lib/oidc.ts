import { createHash, randomBytes, timingSafeEqual } from "crypto";
import jwt from "jsonwebtoken";
import type { Papel } from "@/lib/apps";
import { chaveDeAssinatura, type ChaveDeAssinatura } from "@/lib/chaveOidc";
import { prisma } from "@/lib/prisma";
import { baseUrl } from "@/lib/urls";

/**
 * O `auth.avilaops.com` como **provedor OIDC**, e não só como broker.
 *
 * O broker resolve o portfólio da casa: emite o cookie `avila_sso` em
 * `.avilaops.com` e cada app nosso valida o JWT localmente. Isso não serve para
 * software de terceiro — Outline, Grafana, qualquer coisa comprada pronta —
 * porque essas ferramentas não sabem ler nosso cookie. O que elas sabem falar é
 * OIDC.
 *
 * Estes três endpoints (`/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`)
 * são a tradução: por dentro continua sendo a mesma sessão, a mesma conta de
 * `portal_clients` e a mesma tela de login; por fora vira um provedor padrão.
 *
 * Refresh token: `lib/refreshOAuth.ts`. O que **não** está implementado, de
 * propósito: consentimento por escopo (os
 * clientes são todos nossos, o consentimento é o próprio login) e registro
 * dinâmico de cliente (a lista abaixo é curada à mão, como `apps.ts`).
 */

/** Vida do código de autorização. Curta porque a troca é imediata. */
const VALIDADE_CODIGO_MS = 60 * 1000;

/** Vida do access token. Igual à da sessão do SSO, para não haver duas verdades. */
export const TTL_TOKEN_SEGUNDOS = 8 * 60 * 60;

export const EMISSOR = "https://auth.avilaops.com";

export type ClienteOIDC = {
  /** `client_id` mandado pelo app. */
  id: string;
  /** Entrada correspondente em `apps.ts`, que decide quem pode entrar. */
  appId: string;
  nome: string;
  /**
   * Igualdade exata, nunca prefixo. Um `startsWith` aqui deixaria
   * `https://notas.avilaops.com/auth/oidc.callback.evil.io` passar.
   */
  redirectUris: readonly string[];
  /** Cliente do código: nome da variável de ambiente que guarda o segredo. */
  envSegredo?: string;
  /** Cliente do painel: SHA-256 do segredo, que só foi mostrado uma vez. */
  segredoHash?: string;
  /** Pode ler as conexões da Meta dos clientes (`/api/meta/ativos`). */
  acessoMeta: boolean;
  /** Pode abrir um canal de sinais de segurança e recebê-los (`lib/ssf.ts`). */
  ssf: boolean;
  /** De onde veio: lista fixa abaixo ou cadastro em `/admin/integracoes`. */
  origem: "codigo" | "painel";
};

/**
 * Clientes fixos. Continuam aqui porque já estão em produção com o segredo em
 * variável de ambiente; sistema novo entra pelo painel, sem commit nem deploy.
 * Um cadastro do painel com o mesmo `id` tem precedência.
 */
export const CLIENTES_OIDC: readonly ClienteOIDC[] = [
  {
    id: "notas",
    appId: "notas",
    nome: "Notas",
    redirectUris: ["https://notas.avilaops.com/auth/oidc.callback"],
    envSegredo: "OIDC_SEGREDO_NOTAS",
    acessoMeta: false,
    ssf: false,
    origem: "codigo",
  },
  {
    // TMS (avilaops/TMS). É da casa, mas entra por OIDC e não pelo cookie
    // `avila_sso`: o produto atende várias transportadoras e vai rodar também
    // em domínio próprio de cliente, onde o cookie de `.avilaops.com` não chega.
    // Domínio novo do TMS = endereço de retorno novo nesta lista.
    id: "tms",
    appId: "tms",
    nome: "TMS",
    redirectUris: ["https://tms.avilaops.com/api/auth/callback/avilaops"],
    envSegredo: "OIDC_SEGREDO_TMS",
    acessoMeta: false,
    ssf: false,
    origem: "codigo",
  },
] as const;

/** Um endereço por linha, como o painel grava. */
export function lerRedirectUris(texto: string): string[] {
  return texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

/**
 * Procura o cliente: primeiro no cadastro do painel, depois na lista fixa.
 *
 * Cliente desativado no painel não cai para a lista fixa de mesmo `id` —
 * desativar tem de fechar a porta, não reabrir a antiga. Se a tabela ainda não
 * existe (migração pendente), vale só a lista fixa.
 */
export async function buscarCliente(id: string | null | undefined): Promise<ClienteOIDC | null> {
  if (!id) return null;
  try {
    const linha = await prisma.clienteOidc.findUnique({ where: { id } });
    if (linha) {
      if (!linha.ativo) return null;
      return {
        id: linha.id,
        appId: linha.appId,
        nome: linha.nome,
        redirectUris: lerRedirectUris(linha.redirectUris),
        segredoHash: linha.segredoHash,
        acessoMeta: linha.acessoMeta,
        ssf: linha.ssf,
        origem: "painel",
      };
    }
  } catch (e) {
    const codigo = (e as { code?: unknown })?.code;
    if (codigo !== "P2021" && codigo !== "P2022") throw e;
  }
  return CLIENTES_OIDC.find((c) => c.id === id) ?? null;
}

export function redirectUriValido(cliente: ClienteOIDC, uri: string | null | undefined): boolean {
  return !!uri && cliente.redirectUris.includes(uri);
}

function iguais(a: Buffer, b: Buffer): boolean {
  // `timingSafeEqual` exige o mesmo tamanho; comparar o tamanho antes é
  // aceitável — o comprimento do segredo não é o que o protege.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Confere o `client_secret`.
 *
 * Comparação em tempo constante: `===` em string vaza o tamanho do prefixo
 * correto pelo tempo de resposta, e segredo se descobre caractere a caractere.
 */
export function segredoConfere(cliente: ClienteOIDC, enviado: string | null | undefined): boolean {
  if (!enviado) return false;
  if (cliente.segredoHash) {
    return iguais(Buffer.from(cliente.segredoHash, "hex"), createHash("sha256").update(enviado).digest());
  }
  const esperado = cliente.envSegredo ? process.env[cliente.envSegredo] : undefined;
  if (!esperado) return false;
  return iguais(Buffer.from(esperado), Buffer.from(enviado));
}

/** Segredo novo para um cliente do painel, e o hash que vai ao banco. */
export function gerarSegredoCliente(): { segredo: string; hash: string } {
  const segredo = randomBytes(32).toString("hex");
  return { segredo, hash: createHash("sha256").update(segredo).digest("hex") };
}

/**
 * Credencial do cliente numa requisição: cabeçalho `Basic` (preferido pelo
 * OIDC) ou `client_id`/`client_secret` no corpo.
 *
 * O Outline manda no corpo; outros mandam no cabeçalho. Aceitar os dois evita
 * um "não funciona" opaco na primeira integração de cada ferramenta nova.
 */
export function lerCredencialCliente(
  autorizacao: string | null,
  corpo?: URLSearchParams,
): { id: string; segredo: string } | null {
  if (autorizacao?.startsWith("Basic ")) {
    try {
      const cru = Buffer.from(autorizacao.slice(6), "base64").toString("utf8");
      const i = cru.indexOf(":");
      if (i > 0) return { id: decodeURIComponent(cru.slice(0, i)), segredo: decodeURIComponent(cru.slice(i + 1)) };
    } catch {
      return null;
    }
    return null;
  }
  const id = corpo?.get("client_id");
  const segredo = corpo?.get("client_secret");
  return id && segredo ? { id, segredo } : null;
}

/**
 * Cliente autenticado, ou `null`. Inexistente e segredo errado dão a mesma
 * resposta: distinguir os casos diria a quem sonda quais `client_id` existem.
 */
export async function autenticarCliente(
  autorizacao: string | null,
  corpo?: URLSearchParams,
): Promise<ClienteOIDC | null> {
  const cred = lerCredencialCliente(autorizacao, corpo);
  const cliente = await buscarCliente(cred?.id);
  return cliente && segredoConfere(cliente, cred?.segredo) ? cliente : null;
}
function hash(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

export type IdentidadeOIDC = {
  sub: string;
  email: string;
  nome: string;
  foto: string | null;
  papel: Papel;
};

/** O que todo token leva, peça o cliente ou não: era o único escopo antes de haver outros. */
export const ESCOPO_PADRAO = "openid profile email";
export const ESCOPO_SSF_LER = "ssf.read";
export const ESCOPO_SSF_GERIR = "ssf.manage";

/**
 * O escopo concedido a um pedido.
 *
 * `openid profile email` vai sempre, como sempre foi: os clientes que já
 * existem nunca precisaram pedir, e passar a exigir quebraria o login deles.
 * `offline_access` entra quando pedido (o refresh token é emitido de qualquer
 * jeito; o escopo só é ecoado para o cliente que confere).
 *
 * Os dois escopos do SSF abrem o canal de sinais de segurança, por onde saem
 * eventos de todas as contas. Por isso só são concedidos com as três condições
 * juntas: o cliente pediu, a integração foi marcada para isso no painel e quem
 * está autorizando é da equipe da casa.
 */
export function escopoConcedido(pedido: string | null | undefined, quem: { clienteSsf: boolean; papel: Papel }): string {
  const pedidos = new Set((pedido ?? "").split(/\s+/).filter(Boolean));
  const concedidos = ESCOPO_PADRAO.split(" ");
  if (pedidos.has("offline_access")) concedidos.push("offline_access");
  if (quem.clienteSsf && quem.papel === "ADMIN") {
    for (const e of [ESCOPO_SSF_GERIR, ESCOPO_SSF_LER]) if (pedidos.has(e)) concedidos.push(e);
  }
  return concedidos.join(" ");
}

export type PedidoCodigo = IdentidadeOIDC & {
  clienteId: string;
  redirectUri: string;
  nonce: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  /** Escopo já decidido por `escopoConcedido`. */
  escopo?: string;
};

export async function emitirCodigoOAuth(p: PedidoCodigo): Promise<string> {
  const codigo = randomBytes(32).toString("hex");

  await prisma.codigoOAuth.create({
    data: {
      codigoHash: hash(codigo),
      clienteId: p.clienteId,
      redirectUri: p.redirectUri,
      nonce: p.nonce,
      codeChallenge: p.codeChallenge,
      codeChallengeMethod: p.codeChallengeMethod,
      escopo: p.escopo ?? null,
      sub: p.sub,
      email: p.email,
      nome: p.nome,
      foto: p.foto,
      papel: p.papel,
      expiraEm: new Date(Date.now() + VALIDADE_CODIGO_MS),
    },
  });

  return codigo;
}

export type ResgateOAuth = IdentidadeOIDC & { nonce: string | null; escopo: string };

/**
 * Resgata o código, marcando-o como usado na mesma operação.
 *
 * O `updateMany` filtrando por `usadoEm: null` é o que garante uso único: dois
 * resgates simultâneos disputam a linha e só um vê `count === 1`. Um `findFirst`
 * seguido de `update` teria janela para os dois passarem — mesmo raciocínio do
 * `codigoTroca.ts`.
 */
export async function resgatarCodigoOAuth(
  codigo: string,
  clienteId: string,
  redirectUri: string,
  codeVerifier: string | null,
): Promise<ResgateOAuth | null> {
  const codigoHash = hash(codigo);

  const registro = await prisma.codigoOAuth.findUnique({ where: { codigoHash } });
  if (!registro) return null;

  // O código pertence a este cliente e volta para o mesmo endereço que pediu.
  // Sem esta checagem, um cliente registrado poderia gastar o código emitido
  // para outro.
  if (registro.clienteId !== clienteId) return null;
  if (registro.redirectUri !== redirectUri) return null;

  if (registro.codeChallenge) {
    if (!codeVerifier) return null;
    const derivado =
      registro.codeChallengeMethod === "plain"
        ? codeVerifier
        : createHash("sha256").update(codeVerifier).digest("base64url");
    if (derivado !== registro.codeChallenge) return null;
  }

  const consumido = await prisma.codigoOAuth.updateMany({
    where: { codigoHash, usadoEm: null, expiraEm: { gt: new Date() } },
    data: { usadoEm: new Date() },
  });
  if (consumido.count !== 1) return null;

  return {
    sub: registro.sub,
    email: registro.email,
    nome: registro.nome,
    foto: registro.foto,
    papel: registro.papel as Papel,
    nonce: registro.nonce,
    escopo: registro.escopo ?? ESCOPO_PADRAO,
  };
}

function segredoJwt(): string {
  const s = process.env.SSO_JWT_SECRET;
  if (!s) throw new Error("SSO_JWT_SECRET não configurado");
  return s;
}

/** Primeiro nome e o resto, para quem pede os dois separados (a Apple pede). */
export function nomePartido(nome: string): { given_name: string; family_name?: string } {
  const [primeiro, ...resto] = nome.trim().split(/\s+/);
  return { given_name: primeiro ?? "", ...(resto.length > 0 ? { family_name: resto.join(" ") } : {}) };
}

function conteudoDoToken(i: IdentidadeOIDC, nonce: string | null, apps?: string[]) {
  return {
    sub: i.sub,
    email: i.email,
    email_verified: true,
    name: i.nome,
    ...nomePartido(i.nome),
    preferred_username: i.email,
    picture: i.foto ?? undefined,
    papel: i.papel,
    // Aplicações que a conta pode abrir (ver `appsDaConta`). Fica só no
    // `id_token`: o access token é lido só por este serviço.
    ...(apps ? { apps } : {}),
    ...(nonce ? { nonce } : {}),
  };
}

/**
 * `id_token` assinado com a chave dada (RS256), ou com o segredo da sessão
 * (HS256) quando não há chave. Separado de `assinarIdToken` para ser testado
 * sem banco.
 */
export function assinarIdTokenCom(chave: ChaveDeAssinatura | null, i: IdentidadeOIDC, clienteId: string, nonce: string | null, apps?: string[]): string {
  const opcoes = { expiresIn: TTL_TOKEN_SEGUNDOS, issuer: EMISSOR, audience: clienteId };
  // Sem chave o `id_token` sai com o mesmo segredo do access token: `token_use` é o que os separa.
  if (!chave) return jwt.sign({ ...conteudoDoToken(i, nonce, apps), token_use: "id" }, segredoJwt(), opcoes);
  return jwt.sign(conteudoDoToken(i, nonce, apps), chave.privadaPem, { ...opcoes, algorithm: "RS256", keyid: chave.kid });
}

/**
 * `id_token`: quem entrou, para qual cliente, provado por assinatura.
 *
 * RS256 com a chave de `lib/chaveOidc.ts`; o cliente confere com a pública de
 * `/oauth/jwks`. Sem chave (falta `AUTH_ENCRYPTION_KEY` ou a migração), cai
 * para HS256 com o segredo da sessão, que nenhum cliente consegue conferir e
 * que os da casa nunca conferiram: a identidade deles vem do `/oauth/userinfo`.
 */
export async function assinarIdToken(i: IdentidadeOIDC, clienteId: string, nonce: string | null, apps?: string[]): Promise<string> {
  return assinarIdTokenCom(await chaveDeAssinatura(), i, clienteId, nonce, apps);
}

/**
 * Access token: lido de volta só por este serviço, no `/oauth/userinfo`. Por
 * isso continua em HS256 com o segredo da sessão: ninguém de fora precisa
 * conferi-lo.
 */
export function assinarAccessToken(i: IdentidadeOIDC, clienteId: string, escopo: string = ESCOPO_PADRAO): string {
  return jwt.sign({ ...conteudoDoToken(i, null), scope: escopo, token_use: "access" }, segredoJwt(), { expiresIn: TTL_TOKEN_SEGUNDOS, issuer: EMISSOR, audience: clienteId });
}

export function verificarAccessToken(token: string): (IdentidadeOIDC & { aud: string; escopos: string[] }) | null {
  try {
    // Só HS256: um `id_token` RS256 não serve de access token.
    const p = jwt.verify(token, segredoJwt(), { issuer: EMISSOR, algorithms: ["HS256"] }) as jwt.JwtPayload;
    if (!p.sub || typeof p.email !== "string") return null;
    // Token emitido antes de `token_use` existir não traz a marca e continua valendo.
    if (p.token_use !== undefined && p.token_use !== "access") return null;
    return {
      sub: p.sub,
      email: p.email,
      nome: typeof p.name === "string" ? p.name : p.email,
      foto: typeof p.picture === "string" ? p.picture : null,
      papel: (p.papel as Papel) ?? "CLIENTE",
      aud: typeof p.aud === "string" ? p.aud : "",
      // Token emitido antes de o escopo existir vale o padrão.
      escopos: (typeof p.scope === "string" ? p.scope : ESCOPO_PADRAO).split(/\s+/).filter(Boolean),
    };
  } catch {
    return null;
  }
}

/**
 * Documento de descoberta. `baseUrl()` para o dev apontar para si mesmo.
 *
 * `comChave` diz se há par de assinatura: com ele o documento anuncia RS256 e
 * o `jwks_uri`; sem ele, HS256 e nenhum `jwks_uri`, que é o que de fato sai.
 */
export function documentoDescoberta(comChave: boolean) {
  const base = baseUrl();
  return {
    issuer: EMISSOR,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    userinfo_endpoint: `${base}/oauth/userinfo`,
    end_session_endpoint: `${base}/api/auth/logout`,
    scopes_supported: ["openid", "profile", "email", "offline_access", ESCOPO_SSF_GERIR, ESCOPO_SSF_LER],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["public"],
    ...(comChave ? { jwks_uri: `${base}/oauth/jwks` } : {}),
    // O aviso de saída é um token assinado: só existe com a chave RS256.
    backchannel_logout_supported: comChave,
    backchannel_logout_session_supported: false,
    id_token_signing_alg_values_supported: [comChave ? "RS256" : "HS256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    code_challenge_methods_supported: ["S256", "plain"],
    claims_supported: ["sub", "email", "email_verified", "name", "given_name", "family_name", "preferred_username", "picture", "papel", "apps"],
  };
}
