import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { urlAbsoluta } from "@/lib/urls";

const VALIDADE_MS = 60 * 60 * 1000; // 1 hora

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Emite um link de recuperação. Só o hash vai ao banco; o link em claro é
 * mostrado ao admin uma vez para ele mandar por WhatsApp/e-mail.
 *
 * `validadeMs` existe para o convite de conta nova (`/api/provisionamento`),
 * que precisa durar dias; a recuperação pedida no painel continua em 1 hora.
 */
export async function emitirLinkRecuperacao(email: string, validadeMs: number = VALIDADE_MS): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.tokenRecuperacao.create({
    data: {
      tokenHash: hash(token),
      email: email.toLowerCase(),
      expiraEm: new Date(Date.now() + validadeMs),
    },
  });
  return urlAbsoluta(`/recuperar/${token}`);
}

export async function validarTokenRecuperacao(token: string): Promise<string | null> {
  const r = await prisma.tokenRecuperacao.findUnique({ where: { tokenHash: hash(token) } });
  if (!r || r.usadoEm || r.expiraEm < new Date()) return null;
  return r.email;
}

/** Consome o token (uso único, sem janela de corrida). Devolve o e-mail. */
export async function consumirTokenRecuperacao(token: string): Promise<string | null> {
  const tokenHash = hash(token);
  const r = await prisma.tokenRecuperacao.findUnique({ where: { tokenHash } });
  if (!r) return null;
  const c = await prisma.tokenRecuperacao.updateMany({
    where: { tokenHash, usadoEm: null, expiraEm: { gt: new Date() } },
    data: { usadoEm: new Date() },
  });
  return c.count === 1 ? r.email : null;
}
