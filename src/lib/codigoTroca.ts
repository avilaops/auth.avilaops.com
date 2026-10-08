import { createHash, randomBytes } from "crypto";
import type { Papel } from "@/lib/apps";
import { prisma } from "@/lib/prisma";

const VALIDADE_MS = 60 * 1000;

function hash(codigo: string): string {
  return createHash("sha256").update(codigo).digest("hex");
}

/**
 * Emite um código de uso único para entregar a sessão fora do cookie.
 *
 * Só o hash vai ao banco: o código em claro existe apenas no redirect. Assim um
 * dump do banco não permite resgatar sessão nenhuma.
 */
export async function emitirCodigo(usuarioId: string, papel: Papel): Promise<string> {
  const codigo = randomBytes(32).toString("hex");

  await prisma.codigoTroca.create({
    data: {
      codigoHash: hash(codigo),
      usuarioId,
      papel,
      expiraEm: new Date(Date.now() + VALIDADE_MS),
    },
  });

  return codigo;
}

export type ResgateOk = { usuarioId: string; papel: Papel };

/**
 * Resgata o código, marcando-o como usado na mesma operação.
 *
 * O `updateMany` com `usadoEm: null` no filtro é o que garante uso único: dois
 * resgates simultâneos disputam a mesma linha e só um vê `count === 1`. Um
 * `findFirst` seguido de `update` teria janela para os dois passarem.
 */
export async function resgatarCodigo(codigo: string): Promise<ResgateOk | null> {
  const codigoHash = hash(codigo);

  const registro = await prisma.codigoTroca.findUnique({ where: { codigoHash } });
  if (!registro) return null;

  const consumido = await prisma.codigoTroca.updateMany({
    where: { codigoHash, usadoEm: null, expiraEm: { gt: new Date() } },
    data: { usadoEm: new Date() },
  });

  if (consumido.count !== 1) return null;

  return { usuarioId: registro.usuarioId, papel: registro.papel as Papel };
}
