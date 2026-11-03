import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function lerRedirectUris(texto: string): string[] {
  return texto.split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean);
}

function tabelaAusente(error: unknown): boolean {
  const codigo = (error as { code?: unknown })?.code;
  return codigo === "P2021" || codigo === "P2022";
}

/**
 * Fonte central dos destinos OIDC.
 *
 * Durante a migração, instalações que ainda não receberam a tabela nova usam
 * o campo textual legado. Assim a leitura é compatível, mas toda instalação
 * migrada passa a obedecer somente aos destinos normalizados e ativos.
 */
export async function destinosDoCliente(clienteId: string, tipo: string, legado: string): Promise<string[]> {
  const delegate = (prisma as typeof prisma & { redirectUri?: typeof prisma.redirectUri }).redirectUri;
  if (!delegate) return lerRedirectUris(legado);
  try {
    const linhas = await delegate.findMany({
      where: { clienteId, tipo, ativo: true },
      orderBy: { criadoEm: "asc" },
      select: { uri: true },
    });
    // Uma consulta vazia também é uma decisão: nenhum destino está autorizado.
    // Reativar o texto legado aqui desfaria a revogação do último redirect.
    return linhas.map((linha) => linha.uri);
  } catch (error) {
    if (!tabelaAusente(error)) throw error;
  }
  return lerRedirectUris(legado);
}

export async function redirectUrisDoCliente(clienteId: string, legado: string): Promise<string[]> {
  return destinosDoCliente(clienteId, "authorization", legado);
}

export async function postLogoutRedirectUrisDoCliente(clienteId: string, legado: string): Promise<string[]> {
  return destinosDoCliente(clienteId, "post_logout", legado);
}

export async function sincronizarDestinosDoCliente(
  tx: Prisma.TransactionClient,
  clienteId: string,
  destinos: { authorization: string[]; postLogout: string[] },
): Promise<void> {
  await tx.redirectUri.deleteMany({ where: { clienteId } });
  const rows = [
    ...destinos.authorization.map((uri) => ({ clienteId, tipo: "authorization", uri })),
    ...destinos.postLogout.map((uri) => ({ clienteId, tipo: "post_logout", uri })),
  ];
  if (rows.length > 0) await tx.redirectUri.createMany({ data: rows, skipDuplicates: true });
}

