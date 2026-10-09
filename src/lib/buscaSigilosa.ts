import { Prisma } from "@prisma/client";
import { cifrar, decifrar } from "@/lib/cripto";
import { prisma } from "@/lib/prisma";

/**
 * Busca por CPF no painel, guardada no servidor.
 *
 * CPF não pode ficar na URL (histórico do navegador, link copiado, log de
 * proxy). A primeira versão o mandava num cookie gravado pelo navegador: saía
 * da URL, mas o valor continuava em claro no navegador, legível por script, e
 * viajava em todo pedido do painel.
 *
 * Agora o texto fica nesta tabela, cifrado, e a URL leva só um identificador
 * aleatório. O identificador não abre nada sozinho: a leitura confere a conta
 * da sessão, a seção e a validade. Cada conta tem uma busca guardada por seção;
 * gravar outra apaga a anterior, e as vencidas são apagadas no caminho.
 *
 * O valor nunca é escrito em log nem em `eventos`.
 */

/** Tempo que a busca vale. Depois disso a tela pede para digitar de novo. */
export const VALIDADE_DA_BUSCA_MS = 30 * 60 * 1000;
const TAMANHO_MAXIMO = 40;

function tabelaAusente(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2021" || e.code === "P2022");
}

export function validade(agora = Date.now()): Date {
  return new Date(agora + VALIDADE_DA_BUSCA_MS);
}

export async function guardarBusca(email: string, secao: string, termo: string): Promise<string> {
  const dono = email.toLowerCase();
  await prisma.buscaPainel.deleteMany({ where: { OR: [{ email: dono, secao }, { expiraEm: { lt: new Date() } }] } });
  const criada = await prisma.buscaPainel.create({
    data: { email: dono, secao, termoEnc: cifrar(termo.trim().slice(0, TAMANHO_MAXIMO)), expiraEm: validade() },
    select: { id: true },
  });
  return criada.id;
}

/** O texto guardado, se o identificador for desta conta, desta seção e ainda valer. */
export async function lerBusca(id: string, email: string, secao: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const linha = await prisma.buscaPainel.findUnique({ where: { id } });
    if (!linha || linha.email !== email.toLowerCase() || linha.secao !== secao) return null;
    if (linha.expiraEm.getTime() <= Date.now()) {
      await prisma.buscaPainel.delete({ where: { id } }).catch(() => {});
      return null;
    }
    return decifrar(linha.termoEnc);
  } catch (e) {
    // Tabela ainda não migrada ou chave trocada: a busca simplesmente não vale.
    if (tabelaAusente(e)) return null;
    return null;
  }
}

export async function esquecerBusca(email: string, secao: string): Promise<void> {
  await prisma.buscaPainel.deleteMany({ where: { email: email.toLowerCase(), secao } }).catch((e) => {
    if (!tabelaAusente(e)) throw e;
  });
}
