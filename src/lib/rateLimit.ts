import { prisma } from "@/lib/prisma";

/**
 * Limite de tentativas, contado no banco.
 *
 * Era um `Map` em memória: zerava a cada deploy (quem estava travado ganhava
 * tentativas novas de graça) e, com duas instâncias, cada uma teria o seu
 * contador e o limite efetivo dobraria sem ninguém perceber.
 *
 * O contador em memória continua aqui como reserva. Se a tabela ainda não
 * existe ou o banco não responde, o limite segue valendo neste processo em vez
 * de sumir — e em vez de derrubar o login, que foi a lição do segundo fator.
 */

const memoria = new Map<string, { conta: number; reiniciaEm: number }>();

function limitarEmMemoria(chave: string, max: number, janelaMs: number): boolean {
  const agora = Date.now();
  const atual = memoria.get(chave);

  if (!atual || agora > atual.reiniciaEm) {
    memoria.set(chave, { conta: 1, reiniciaEm: agora + janelaMs });
    return true;
  }
  if (atual.conta >= max) return false;
  atual.conta += 1;
  return true;
}

let avisado = false;

/**
 * Conta mais uma tentativa e diz se ela ainda cabe no limite.
 *
 * Uma instrução só, de propósito: ler e depois gravar deixaria duas
 * requisições simultâneas lerem o mesmo número e passarem as duas.
 */
export async function limitar(chave: string, max: number, janelaMs: number): Promise<boolean> {
  try {
    const fim = new Date(Date.now() + janelaMs);
    const linhas = await prisma.$queryRaw<{ conta: number }[]>`
      INSERT INTO "tentativas" ("chave", "conta", "reinicia_em")
      VALUES (${chave}, 1, ${fim})
      ON CONFLICT ("chave") DO UPDATE SET
        "conta" = CASE WHEN "tentativas"."reinicia_em" < now() THEN 1 ELSE "tentativas"."conta" + 1 END,
        "reinicia_em" = CASE WHEN "tentativas"."reinicia_em" < now() THEN EXCLUDED."reinicia_em" ELSE "tentativas"."reinicia_em" END
      RETURNING "conta"`;
    return Number(linhas[0]?.conta ?? 1) <= max;
  } catch (e) {
    if (!avisado) {
      avisado = true;
      console.error("[rateLimit] banco indisponível para o contador; usando memória", e instanceof Error ? e.message : e);
    }
    return limitarEmMemoria(chave, max, janelaMs);
  }
}

/** Limpa o registro após login bem-sucedido, para não punir quem acertou. */
export async function liberar(chave: string): Promise<void> {
  memoria.delete(chave);
  try {
    await prisma.tentativa.deleteMany({ where: { chave } });
  } catch {
    /* sem a tabela não há o que limpar */
  }
}

/** Tira do banco as janelas já vencidas. Chamado de vez em quando, sem pressa. */
export async function limparVencidas(): Promise<void> {
  try {
    await prisma.tentativa.deleteMany({ where: { reiniciaEm: { lt: new Date() } } });
  } catch {
    /* idem */
  }
}
