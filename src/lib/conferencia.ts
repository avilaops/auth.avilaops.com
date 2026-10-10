import { Prisma } from "@prisma/client";
import type { Cadastro, Situacao } from "@/lib/apps";
import { prisma } from "@/lib/prisma";

/**
 * Conferência das aplicações: o painel pede o endereço de cada uma e guarda
 * se respondeu.
 *
 * A situação do cadastro continua sendo a informada por alguém da equipe, e é
 * ela que decide se o app recebe sessão (`recebeLogin`). A conferência é só o
 * que foi observado, mostrado ao lado, para a divergência aparecer: cadastro
 * dizendo "no ar" com o endereço mudo, ou "fora do ar" com ele respondendo.
 *
 * "Responde" quer dizer que um servidor atendeu em `https://host/` com
 * qualquer código abaixo de 500. Redirecionar para o login ou negar com 401 é
 * resposta: quem está no ar e fechado está no ar. Não diz que a aplicação
 * funciona por dentro.
 */

export type Conferencia = { responde: boolean; status: number | null; detalhe: string | null; conferidaEm: Date };

/** Depois de quanto tempo a conferência guardada é refeita. */
export const VALIDADE_MS = 10 * 60 * 1000;
const TEMPO_LIMITE_MS = 5000;
const SIMULTANEAS = 6;

/** Só se confere o que o cadastro diz existir: planejada e desativada ficam de fora. */
export function precisaConferir(situacao: Situacao): boolean {
  return situacao === "no_ar" || situacao === "fora_do_ar";
}

export function vencida(conferidaEm: Date | null | undefined, agora: number): boolean {
  return !conferidaEm || agora - conferidaEm.getTime() >= VALIDADE_MS;
}

/** O que a resposta (ou a falta dela) significa. */
export function interpretar(r: { status: number } | { erro: string }): Omit<Conferencia, "conferidaEm"> {
  if ("status" in r) return { responde: r.status < 500, status: r.status, detalhe: null };
  return { responde: false, status: null, detalhe: r.erro };
}

/** Falha de rede em palavras de tela. */
export function motivoDaFalha(e: unknown): string {
  const nome = e instanceof Error ? e.name : "";
  const codigo = (e as { cause?: { code?: string } } | null)?.cause?.code ?? "";
  if (nome === "TimeoutError" || nome === "AbortError") return "sem resposta em 5 segundos";
  if (codigo === "ENOTFOUND" || codigo === "EAI_AGAIN") return "o endereço não existe no DNS";
  if (codigo === "ECONNREFUSED") return "conexão recusada";
  if (codigo.includes("CERT")) return "certificado inválido";
  return "falha de rede";
}

export type Divergencia = "informada_no_ar_sem_resposta" | "informada_fora_do_ar_respondendo";

/** O cadastro e a conferência discordam? Sem conferência não há o que comparar. */
export function divergencia(situacao: Situacao, c: Pick<Conferencia, "responde"> | null | undefined): Divergencia | null {
  if (!c) return null;
  if (situacao === "no_ar" && !c.responde) return "informada_no_ar_sem_resposta";
  if (situacao === "fora_do_ar" && c.responde) return "informada_fora_do_ar_respondendo";
  return null;
}

/** Texto curto do resultado, para a listagem e a ficha. */
export function descrever(c: Pick<Conferencia, "responde" | "status" | "detalhe">): string {
  if (c.responde) return "Responde";
  return c.status ? `Não responde (erro ${c.status})` : `Não responde (${c.detalhe ?? "falha de rede"})`;
}

/**
 * Pede a página inicial da aplicação. Não segue redirecionamento: o que
 * interessa é se o endereço cadastrado atende, não para onde ele manda.
 */
async function sondar(host: string): Promise<Omit<Conferencia, "conferidaEm">> {
  try {
    const r = await fetch(`https://${host}/`, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      headers: { "user-agent": "avilaops-auth-conferencia" },
    });
    return interpretar({ status: r.status });
  } catch (e) {
    return interpretar({ erro: motivoDaFalha(e) });
  }
}

/** Tabela ainda não migrada: o painel segue sem conferência em vez de cair. */
function tabelaAusente(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2021" || e.code === "P2022");
}

/** `id da aplicação → última conferência`. */
export async function lerConferencias(): Promise<Map<string, Conferencia>> {
  try {
    const linhas = await prisma.conferencia.findMany();
    return new Map(linhas.map((l) => [l.appId, { responde: l.responde, status: l.status, detalhe: l.detalhe, conferidaEm: l.conferidaEm }]));
  } catch (e) {
    if (tabelaAusente(e)) return new Map();
    throw e;
  }
}

let emAndamento = false;

/**
 * Refaz as conferências vencidas e grava o resultado.
 *
 * Chamada depois de a página responder (`after`), para a listagem não esperar
 * pela rede: a tela mostra a última conferência guardada e a próxima abertura
 * já traz a nova. Uma rodada por vez neste processo; falha aqui só fica no log.
 */
export async function conferirVencidas(cadastro: Pick<Cadastro, "id" | "host" | "situacao">[], conhecidas: Map<string, Conferencia>): Promise<void> {
  if (emAndamento) return;
  const agora = Date.now();
  const fila = cadastro.filter((c) => precisaConferir(c.situacao) && vencida(conhecidas.get(c.id)?.conferidaEm, agora));
  if (fila.length === 0) return;
  emAndamento = true;
  try {
    const trabalhar = async () => {
      for (let c = fila.shift(); c; c = fila.shift()) {
        const dados = { ...(await sondar(c.host)), conferidaEm: new Date() };
        await prisma.conferencia.upsert({ where: { appId: c.id }, create: { appId: c.id, ...dados }, update: dados });
      }
    };
    await Promise.all(Array.from({ length: SIMULTANEAS }, trabalhar));
  } catch (e) {
    if (!tabelaAusente(e)) console.error("[conferencia] rodada interrompida", e instanceof Error ? e.message : e);
  } finally {
    emAndamento = false;
  }
}
