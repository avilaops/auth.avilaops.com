import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { chaveDeAssinatura, type ChaveDeAssinatura } from "@/lib/chaveOidc";
import { EMISSOR } from "@/lib/oidc";
import { prisma } from "@/lib/prisma";

/**
 * Aviso de saída aos sistemas (back-channel logout do OIDC).
 *
 * Sair no Auth apaga o cookie e revoga os refresh tokens, mas o sistema que
 * entrou por OIDC tem a sessão dele e só perceberia quando o access token
 * vencesse. Aqui o Auth avisa: manda a cada integração que cadastrou um
 * endereço de aviso um `logout_token` assinado (RS256, conferível pelo
 * `/oauth/jwks`) dizendo qual conta saiu. O sistema confere a assinatura e
 * encerra a sessão daquela conta.
 *
 * É aviso, não garantia: um sistema fora do ar perde o aviso. Por isso a saída
 * não depende dele (o refresh já foi revogado) e a falha só fica no log.
 */

export const EVENTO_DE_LOGOUT = "http://schemas.openid.net/event/backchannel-logout";
const TEMPO_LIMITE_MS = 3000;
/** O aviso vale por pouco tempo: é para ser consumido na hora. */
const VALIDADE_SEGUNDOS = 120;

/** O `logout_token` de uma conta para um cliente. Sem `nonce`, como manda a especificação. */
export function montarLogoutToken(chave: ChaveDeAssinatura, clienteId: string, sub: string): string {
  return jwt.sign({ sub, events: { [EVENTO_DE_LOGOUT]: {} }, jti: randomUUID() }, chave.privadaPem, {
    algorithm: "RS256",
    keyid: chave.kid,
    issuer: EMISSOR,
    audience: clienteId,
    expiresIn: VALIDADE_SEGUNDOS,
    header: { alg: "RS256", typ: "logout+jwt", kid: chave.kid },
  });
}

/** Avisa todas as integrações ativas que cadastraram endereço de aviso. Nunca lança. */
export async function avisarLogout(sub: string): Promise<void> {
  try {
    const clientes = await prisma.clienteOidc.findMany({ where: { ativo: true, logoutUri: { not: null } }, select: { id: true, logoutUri: true } });
    if (clientes.length === 0) return;
    const chave = await chaveDeAssinatura();
    if (!chave) {
      console.warn("[logout] sem chave de assinatura: os sistemas não foram avisados da saída");
      return;
    }
    await Promise.all(
      clientes.map(async (c) => {
        try {
          const r = await fetch(c.logoutUri as string, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ logout_token: montarLogoutToken(chave, c.id, sub) }),
            redirect: "manual",
            signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
          });
          if (r.status >= 400) console.warn(`[logout] ${c.id} respondeu ${r.status} ao aviso de saída`);
        } catch (e) {
          console.warn(`[logout] ${c.id} não recebeu o aviso de saída:`, e instanceof Error ? e.message : e);
        }
      }),
    );
  } catch (e) {
    const codigo = (e as { code?: unknown })?.code;
    // Coluna ainda não migrada: ninguém cadastrou aviso.
    if (codigo !== "P2021" && codigo !== "P2022") console.error("[logout] aviso de saída falhou", e instanceof Error ? e.message : e);
  }
}
