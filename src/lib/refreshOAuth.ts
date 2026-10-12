import { createHash, randomBytes, randomUUID } from "crypto";
import type { Papel } from "@/lib/apps";
import { papelDaRole, type Conta } from "@/lib/contas";
import type { IdentidadeOIDC } from "@/lib/oidc";
import { prisma } from "@/lib/prisma";

/**
 * Refresh token do provedor OIDC.
 *
 * Sem ele, o sistema que entra por OIDC manda a pessoa de volta ao login a
 * cada 8 horas (a vida do access token). Com ele, o sistema troca o refresh
 * por tokens novos sem a pessoa perceber, por até 30 dias sem uso.
 *
 * Três regras, todas para o refresh não virar uma sessão que ninguém desliga:
 *
 * - **Rotação.** Cada troca gasta o token e emite outro. Um token vale uma vez.
 * - **Reuso derruba a família.** Token já gasto que aparece de novo é sinal de
 *   cópia: quem roubou e o dono legítimo ficam os dois sem acesso, e o
 *   legítimo volta pelo login.
 * - **A conta é conferida a cada troca** (quem chama faz isso, com
 *   `identidadeParaRenovar`): conta desligada, removida ou sem direito de
 *   entrar na aplicação não renova, mesmo com token válido.
 *
 * Sair no Auth revoga os refresh da conta (`revogarRefreshDaConta`).
 *
 * Tabela ausente (migração pendente): não emite e não troca. O login por
 * código continua funcionando, como antes de o refresh existir.
 */

export const VALIDADE_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;

function hash(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

function semTabela(e: unknown): boolean {
  const codigo = (e as { code?: unknown })?.code;
  return codigo === "P2021" || codigo === "P2022";
}

/** Emite um refresh token. `familia` vem da troca anterior; ausente, começa uma nova. */
export async function emitirRefresh(dados: { clienteId: string; sub: string; email: string; familia?: string }): Promise<string | null> {
  const token = randomBytes(32).toString("hex");
  try {
    await prisma.refreshOAuth.create({
      data: {
        tokenHash: hash(token),
        familia: dados.familia ?? randomUUID(),
        clienteId: dados.clienteId,
        sub: dados.sub,
        email: dados.email.toLowerCase(),
        expiraEm: new Date(Date.now() + VALIDADE_REFRESH_MS),
      },
    });
    return token;
  } catch (e) {
    if (semTabela(e)) return null;
    throw e;
  }
}

export type TrocaDeRefresh =
  | { ok: true; sub: string; email: string; familia: string }
  | { ok: false; motivo: "invalido" | "reuso"; email?: string };

/**
 * Gasta o refresh token. Uma instrução só decide quem ganha quando duas trocas
 * chegam juntas (mesmo raciocínio do código de autorização): só uma vê
 * `count === 1`.
 */
export async function gastarRefresh(token: string, clienteId: string): Promise<TrocaDeRefresh> {
  const tokenHash = hash(token);
  try {
    const registro = await prisma.refreshOAuth.findUnique({ where: { tokenHash } });
    // Token de outro cliente responde igual a token inexistente.
    if (!registro || registro.clienteId !== clienteId) return { ok: false, motivo: "invalido" };

    const gasto = await prisma.refreshOAuth.updateMany({
      where: { tokenHash, usadoEm: null, revogadoEm: null, expiraEm: { gt: new Date() } },
      data: { usadoEm: new Date() },
    });
    if (gasto.count === 1) return { ok: true, sub: registro.sub, email: registro.email, familia: registro.familia };

    // Já gasto e ainda não revogado: alguém está usando uma cópia.
    if (registro.usadoEm && !registro.revogadoEm) {
      await revogarFamilia(registro.familia);
      return { ok: false, motivo: "reuso", email: registro.email };
    }
    return { ok: false, motivo: "invalido" };
  } catch (e) {
    if (semTabela(e)) return { ok: false, motivo: "invalido" };
    throw e;
  }
}

export async function revogarFamilia(familia: string): Promise<void> {
  await prisma.refreshOAuth.updateMany({ where: { familia, revogadoEm: null }, data: { revogadoEm: new Date() } });
}

/** Sair no Auth: nenhum sistema renova mais a sessão desta conta sem novo login. */
export async function revogarRefreshDaConta(sub: string): Promise<void> {
  try {
    await prisma.refreshOAuth.updateMany({ where: { sub, revogadoEm: null }, data: { revogadoEm: new Date() } });
  } catch (e) {
    if (!semTabela(e)) throw e;
  }
}

/**
 * A identidade a pôr nos tokens renovados, lida da conta de agora: nome e papel
 * podem ter mudado desde o login. `null` quando a conta não existe mais ou foi
 * desligada, e aí não há renovação.
 */
export function identidadeParaRenovar(conta: Pick<Conta, "id" | "email" | "nome" | "role" | "ativa"> | null): IdentidadeOIDC | null {
  if (!conta || !conta.ativa) return null;
  const papel: Papel = papelDaRole(conta.role);
  return { sub: conta.id, email: conta.email, nome: conta.nome, foto: null, papel };
}
