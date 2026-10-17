import { generateKeyPairSync, randomBytes, type JsonWebKey } from "crypto";
import { chaveConfigurada, cifrar, decifrar } from "@/lib/cripto";
import { prisma } from "@/lib/prisma";

/**
 * Chave que assina o `id_token` do provedor OIDC.
 *
 * O `id_token` era HS256 com o segredo da sessão. Para conferir a assinatura,
 * o cliente precisaria desse segredo, e quem o tem forja sessão de qualquer
 * pessoa: por isso nenhum cliente conferia, e todos buscavam a identidade no
 * `/oauth/userinfo`. Com RS256 o cliente confere com a chave pública, que pode
 * ser de todo mundo (`/oauth/jwks`).
 *
 * O par nasce na primeira vez que é pedido e fica no banco, com a privada
 * cifrada por `AUTH_ENCRYPTION_KEY`: sobrevive a deploy, é o mesmo para todas
 * as instâncias e não pede variável nova no servidor. Sem a chave de cifra ou
 * sem a tabela (migração pendente) não há par, e o `id_token` segue em HS256
 * como antes, em vez de derrubar o login.
 *
 * **Troca da chave** (painel, em Integrações). Cada chave tem `assinaDesde`:
 *
 * - troca agendada: a chave nova é publicada no JWKS na hora e só começa a
 *   assinar um dia depois, tempo de os clientes renovarem a cópia do JWKS que
 *   guardam. A antiga continua publicada até os tokens assinados por ela
 *   vencerem e então sai sozinha;
 * - troca imediata, para chave vazada: a nova assina na hora e as antigas
 *   saem do JWKS na hora. Token assinado pela antiga deixa de conferir, que é
 *   o que se quer quando ela vazou.
 */

export type ChaveDeAssinatura = { kid: string; privadaPem: string };
export type JwkPublica = JsonWebKey & { kid: string; use: "sig"; alg: "RS256" };

/** Quanto a chave nova fica só publicada, sem assinar, numa troca agendada. */
export const ESPERA_DA_TROCA_MS = 24 * 60 * 60 * 1000;
/**
 * Quanto a chave antiga segue publicada depois de deixar de assinar: a
 * validade do `id_token` (`TTL_TOKEN_SEGUNDOS`, 8 horas) com uma hora de folga.
 * Fica escrito aqui, e não importado de `oidc.ts`, porque `oidc.ts` importa
 * este arquivo; o teste confere que os dois continuam de acordo.
 */
export const RETENCAO_DA_ANTIGA_MS = 9 * 60 * 60 * 1000;
/** De quanto em quanto tempo a lista de chaves é relida do banco. */
const RELEITURA_MS = 60 * 1000;

/** Gera um par RSA de 2048 bits no formato em que é guardado. */
export function gerarPar(): { kid: string; publicaJwk: JsonWebKey; privadaPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    kid: randomBytes(8).toString("hex"),
    publicaJwk: publicKey.export({ format: "jwk" }),
    privadaPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
}

/** A chave pública como aparece no JWKS. */
export function paraJwks(kid: string, publicaJwk: JsonWebKey): JwkPublica {
  return { kty: publicaJwk.kty, n: publicaJwk.n, e: publicaJwk.e, kid, use: "sig", alg: "RS256" };
}

type LinhaDeChave = { kid: string; assinaDesde: Date };

/**
 * Qual chave assina, qual vem a seguir, quais vão no JWKS e quais já podem ser
 * apagadas, a partir da lista do banco.
 *
 * Assina a mais nova entre as que já chegaram ao `assinaDesde`. Uma chave
 * deixa de assinar quando a seguinte começa; a partir daí fica publicada por
 * `RETENCAO_DA_ANTIGA_MS`. Duas instâncias que subam juntas num banco vazio
 * gravam uma chave cada, e as duas passam a assinar com a mesma.
 */
export function situacaoDasChaves<T extends LinhaDeChave>(linhas: T[], agora: number = Date.now()) {
  const ordenadas = [...linhas].sort((a, b) => a.assinaDesde.getTime() - b.assinaDesde.getTime() || a.kid.localeCompare(b.kid));
  const vigentes = ordenadas.filter((l) => l.assinaDesde.getTime() <= agora);
  const futuras = ordenadas.filter((l) => l.assinaDesde.getTime() > agora);
  const assina = vigentes.at(-1) ?? null;
  const publicadas: T[] = [];
  const vencidas: T[] = [];
  vigentes.forEach((l, i) => {
    if (l === assina) return;
    const deixouDeAssinar = vigentes[i + 1].assinaDesde.getTime();
    (agora - deixouDeAssinar < RETENCAO_DA_ANTIGA_MS ? publicadas : vencidas).push(l);
  });
  return {
    assina,
    proxima: futuras[0] ?? null,
    publicadas: [...publicadas, ...(assina ? [assina] : []), ...futuras],
    vencidas,
  };
}

/** Tabela ou coluna ainda não migrada. */
function semTabela(e: unknown): boolean {
  const codigo = (e as { code?: unknown })?.code;
  return codigo === "P2021" || codigo === "P2022";
}

type Linha = { kid: string; publicaJwk: string; privadaEnc: string; assinaDesde: Date; criadaEm: Date };

type Memoria = { linhas: Linha[] | null; lidaEm: number; privadas: Map<string, string> };

/**
 * Cópia das chaves lidas do banco, uma só por processo. Fica no `globalThis`
 * porque o Next empacota as ações do painel e as rotas (`/oauth/token`,
 * `/oauth/jwks`) separadamente, cada pacote com seus próprios módulos: com uma
 * variável do módulo, a troca feita no painel só chegava ao JWKS e ao token
 * quando a cópia deles vencesse.
 */
const global = globalThis as unknown as { chavesOidc?: Memoria };
const memoria: Memoria = (global.chavesOidc ??= { linhas: null, lidaEm: 0, privadas: new Map() });

/** Esquece o que foi lido: a próxima pergunta vai ao banco. */
function esquecer(): void {
  memoria.linhas = null;
  memoria.lidaEm = 0;
}

/**
 * As chaves do banco, relidas no máximo uma vez por minuto. Banco sem chave
 * ganha a primeira aqui. As que já passaram da retenção são apagadas na
 * passagem.
 */
async function chavesDoBanco(): Promise<Linha[]> {
  if (memoria.linhas && Date.now() - memoria.lidaEm < RELEITURA_MS) return memoria.linhas;
  let linhas = await prisma.chaveOidc.findMany();
  if (linhas.length === 0) {
    const par = gerarPar();
    await prisma.chaveOidc.create({ data: { kid: par.kid, publicaJwk: JSON.stringify(par.publicaJwk), privadaEnc: cifrar(par.privadaPem) } });
    linhas = await prisma.chaveOidc.findMany();
  }
  const { vencidas } = situacaoDasChaves(linhas);
  if (vencidas.length > 0) {
    await prisma.chaveOidc.deleteMany({ where: { kid: { in: vencidas.map((v) => v.kid) } } });
    linhas = linhas.filter((l) => !vencidas.includes(l));
  }
  memoria.linhas = linhas;
  memoria.lidaEm = Date.now();
  return linhas;
}

/** A chave que assina, ou `null` quando não dá para ter uma. */
export async function chaveDeAssinatura(): Promise<ChaveDeAssinatura | null> {
  if (!chaveConfigurada()) return null;
  try {
    const { assina } = situacaoDasChaves(await chavesDoBanco());
    if (!assina) return null;
    let privadaPem = memoria.privadas.get(assina.kid);
    if (!privadaPem) {
      privadaPem = decifrar(assina.privadaEnc);
      memoria.privadas.set(assina.kid, privadaPem);
    }
    return { kid: assina.kid, privadaPem };
  } catch (e) {
    if (!semTabela(e)) console.error("[oidc] chave de assinatura indisponível; id_token segue em HS256", e instanceof Error ? e.message : e);
    return null;
  }
}

/** As chaves públicas para `/oauth/jwks`. Lista vazia quando não há par. */
export async function chavesPublicas(): Promise<JwkPublica[]> {
  // Garante que a chave exista antes de publicar: o cliente lê o JWKS na
  // configuração, antes do primeiro login.
  if (!(await chaveDeAssinatura())) return [];
  const { publicadas } = situacaoDasChaves(await chavesDoBanco());
  return publicadas.map((l) => paraJwks(l.kid, JSON.parse(l.publicaJwk) as JsonWebKey));
}

export type SituacaoParaOPainel = {
  assina: { kid: string; desde: Date } | null;
  proxima: { kid: string; desde: Date } | null;
  publicadas: number;
};

/** O que o painel mostra. `null` quando não há como ter chave (falta a variável ou a migração). */
export async function situacaoParaOPainel(): Promise<SituacaoParaOPainel | null> {
  if (!(await chaveDeAssinatura())) return null;
  const s = situacaoDasChaves(await chavesDoBanco());
  return {
    assina: s.assina ? { kid: s.assina.kid, desde: s.assina.assinaDesde } : null,
    proxima: s.proxima ? { kid: s.proxima.kid, desde: s.proxima.assinaDesde } : null,
    publicadas: s.publicadas.length,
  };
}

async function gravarNova(assinaDesde: Date): Promise<string> {
  const par = gerarPar();
  await prisma.chaveOidc.create({ data: { kid: par.kid, publicaJwk: JSON.stringify(par.publicaJwk), privadaEnc: cifrar(par.privadaPem), assinaDesde } });
  return par.kid;
}

/**
 * Agenda a troca: a chave nova entra no JWKS agora e assina daqui a
 * `ESPERA_DA_TROCA_MS`. Com uma troca já agendada, devolve `null`: duas
 * chaves esperando a vez não ajudam ninguém.
 */
export async function agendarTroca(agora: number = Date.now()): Promise<{ kid: string; assinaDesde: Date } | null> {
  esquecer();
  if (situacaoDasChaves(await chavesDoBanco(), agora).proxima) return null;
  const assinaDesde = new Date(agora + ESPERA_DA_TROCA_MS);
  const kid = await gravarNova(assinaDesde);
  esquecer();
  return { kid, assinaDesde };
}

/** Troca na hora, para chave vazada: a nova assina já e todas as outras são apagadas. */
export async function trocarAgora(): Promise<string> {
  const kid = await gravarNova(new Date());
  await prisma.chaveOidc.deleteMany({ where: { kid: { not: kid } } });
  esquecer();
  memoria.privadas.clear();
  return kid;
}
