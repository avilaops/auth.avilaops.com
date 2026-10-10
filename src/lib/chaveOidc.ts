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
 */

export type ChaveDeAssinatura = { kid: string; privadaPem: string };
export type JwkPublica = JsonWebKey & { kid: string; use: "sig"; alg: "RS256" };

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

/** Tabela ou coluna ainda não migrada. */
function semTabela(e: unknown): boolean {
  const codigo = (e as { code?: unknown })?.code;
  return codigo === "P2021" || codigo === "P2022";
}

let emMemoria: ChaveDeAssinatura | null = null;

/**
 * A chave que assina, ou `null` quando não dá para ter uma.
 *
 * Quem assina é sempre a mais antiga do banco. Duas instâncias que subam
 * juntas num banco vazio gravam uma chave cada, mas as duas passam a assinar
 * com a mesma, e o JWKS publica ambas.
 */
export async function chaveDeAssinatura(): Promise<ChaveDeAssinatura | null> {
  if (emMemoria) return emMemoria;
  if (!chaveConfigurada()) return null;
  try {
    const maisAntiga = () => prisma.chaveOidc.findFirst({ orderBy: [{ criadaEm: "asc" }, { kid: "asc" }] });
    let linha = await maisAntiga();
    if (!linha) {
      const par = gerarPar();
      await prisma.chaveOidc.create({ data: { kid: par.kid, publicaJwk: JSON.stringify(par.publicaJwk), privadaEnc: cifrar(par.privadaPem) } });
      linha = await maisAntiga();
    }
    if (!linha) return null;
    emMemoria = { kid: linha.kid, privadaPem: decifrar(linha.privadaEnc) };
    return emMemoria;
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
  const linhas = await prisma.chaveOidc.findMany({ orderBy: [{ criadaEm: "asc" }, { kid: "asc" }] });
  return linhas.map((l) => paraJwks(l.kid, JSON.parse(l.publicaJwk) as JsonWebKey));
}
