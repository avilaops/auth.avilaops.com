import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { urlAbsoluta } from "@/lib/urls";

const VALIDADE_MS = 60 * 60 * 1000; // 1 hora

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** De quem é o link e, quando é convite de um sistema, de qual sistema. */
export type LinkRecuperacao = { email: string; appId: string | null; destino: string | null };

/**
 * Emite um link de recuperação. Só o hash vai ao banco; o link em claro é
 * mostrado ao admin uma vez para ele mandar por WhatsApp/e-mail.
 *
 * `validadeMs` existe para o convite de conta nova (`/api/provisionamento`),
 * que precisa durar dias; a recuperação pedida no painel continua em 1 hora.
 * `appId` é o sistema que convidou: depois de criar a senha a pessoa cai nele,
 * em `destino` (quem chama já conferiu que é um endereço do próprio sistema).
 */
export async function emitirLinkRecuperacao(email: string, validadeMs: number = VALIDADE_MS, appId: string | null = null, destino: string | null = null): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.tokenRecuperacao.create({
    data: {
      tokenHash: hash(token),
      email: email.toLowerCase(),
      appId,
      destino,
      expiraEm: new Date(Date.now() + validadeMs),
    },
  });
  return urlAbsoluta(`/recuperar/${token}`);
}

export async function validarTokenRecuperacao(token: string): Promise<LinkRecuperacao | null> {
  const r = await prisma.tokenRecuperacao.findUnique({ where: { tokenHash: hash(token) } });
  if (!r || r.usadoEm || r.expiraEm < new Date()) return null;
  return { email: r.email, appId: r.appId, destino: r.destino };
}

/** Consome o token (uso único, sem janela de corrida). */
export async function consumirTokenRecuperacao(token: string): Promise<LinkRecuperacao | null> {
  const tokenHash = hash(token);
  const r = await prisma.tokenRecuperacao.findUnique({ where: { tokenHash } });
  if (!r) return null;
  const c = await prisma.tokenRecuperacao.updateMany({
    where: { tokenHash, usadoEm: null, expiraEm: { gt: new Date() } },
    data: { usadoEm: new Date() },
  });
  return c.count === 1 ? { email: r.email, appId: r.appId, destino: r.destino } : null;
}
