import { poolPortal } from "@/lib/contas";
import { prisma } from "@/lib/prisma";
import { emitirSinal, empurrar, ESPERA_INICIAL_MS, EVENTO_SESSAO_REVOGADA, sinalDoEvento } from "@/lib/ssf";

/**
 * O que os sinais de segurança precisam fazer sem ninguém pedir.
 *
 * **Reenvio.** O sinal sai na hora em que a coisa acontece. Se o receptor está
 * fora do ar nesse instante, o evento ficava perdido, e o sistema do outro lado
 * seguia com a sessão de quem já saiu. Agora o SET recusado fica guardado e é
 * tentado de novo com espera crescente, por até um dia. O SET é guardado
 * antes do primeiro envio, para não sumir se o processo cair no meio.
 *
 * **Conta desligada em outro sistema.** O Auth não tem a ação de desligar
 * conta: quem desliga é o app.avilaops.com, direto na tabela. Para o receptor
 * saber, esta rotina olha as contas desligadas desde a última passada e emite
 * o sinal por elas.
 *
 * As duas rodam dentro do próprio processo (`instrumentation.ts`), como a
 * conferência das aplicações.
 */

export const MAXIMO_DE_TENTATIVAS = 8;
export const VALIDADE_DO_PENDENTE_MS = 24 * 60 * 60 * 1000;

/**
 * Quando tentar de novo um evento que já foi tentado `tentativas` vezes, ou
 * `null` para desistir. A espera dobra a cada tentativa (5, 10, 20, 40 minutos…)
 * e nunca passa de um dia desde que o evento nasceu: aviso de "saiu" com um dia
 * de atraso já não serve a ninguém.
 */
export function proximaTentativa(tentativas: number, criadoEm: Date, agora: number = Date.now()): Date | null {
  if (tentativas >= MAXIMO_DE_TENTATIVAS) return null;
  const quando = agora + ESPERA_INICIAL_MS * 2 ** Math.max(0, tentativas - 1);
  return quando - criadoEm.getTime() > VALIDADE_DO_PENDENTE_MS ? null : new Date(quando);
}

function semTabela(e: unknown): boolean {
  const codigo = (e as { code?: unknown })?.code;
  return codigo === "P2021" || codigo === "P2022" || codigo === "42P01" || codigo === "3F000";
}

/** Tenta de novo os eventos que venceram a espera. Devolve quantos foram entregues. */
export async function reenviarPendentes(agora: number = Date.now()): Promise<number> {
  let entregues = 0;
  try {
    const canais = new Map((await prisma.ssfCanal.findMany()).map((c) => [c.id, c]));
    const ligados = [...canais.values()].filter((c) => c.status === "enabled").map((c) => c.id);
    const pausados = [...canais.values()].filter((c) => c.status === "paused").map((c) => c.id);
    // Sem para quem mandar (canal fechado ou desligado) ou velho demais, mesmo esperando num canal pausado.
    await prisma.ssfPendente.deleteMany({ where: { OR: [{ canalId: { notIn: [...ligados, ...pausados] } }, { criadoEm: { lt: new Date(agora - VALIDADE_DO_PENDENTE_MS) } }] } });
    if (ligados.length === 0) return 0;

    // Só dos canais ligados: o que espera num canal pausado não ocupa a vez dos outros.
    const vencidos = await prisma.ssfPendente.findMany({ where: { canalId: { in: ligados }, proximaEm: { lte: new Date(agora) } }, orderBy: { criadoEm: "asc" }, take: 200 });
    for (const p of vencidos) {
      try {
        const canal = canais.get(p.canalId);
        if (!canal) continue;
        const proxima = proximaTentativa(p.tentativas + 1, p.criadoEm, agora);
        // Reserva o evento antes de enviar, adiando a próxima tentativa. Se outro
        // processo já o pegou (a troca de versão põe dois no ar por instantes), a
        // reserva não acha a linha e este passa adiante.
        const reservado = await prisma.ssfPendente.updateMany({
          where: { id: p.id, proximaEm: p.proximaEm },
          data: { tentativas: p.tentativas + 1, proximaEm: proxima ?? new Date(agora + ESPERA_INICIAL_MS) },
        });
        if (reservado.count === 0) continue;
        if (await empurrar(canal, p.setJwt)) {
          await prisma.ssfPendente.deleteMany({ where: { id: p.id } });
          entregues += 1;
        } else if (!proxima) {
          await prisma.ssfPendente.deleteMany({ where: { id: p.id } });
          console.warn(`[ssf] evento descartado depois de ${p.tentativas + 1} tentativas (canal ${canal.clienteId})`);
        }
      } catch (e) {
        // Um evento com problema não segura os outros da leva.
        console.error("[ssf] reenvio de um evento falhou", e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    if (!semTabela(e)) console.error("[ssf] reenvio falhou", e instanceof Error ? e.message : e);
  }
  return entregues;
}

const MARCA = "ssf.contas-desligadas";

/** Das contas desligadas agora, quais não estavam desligadas na passada anterior. */
export function recemDesligadas<T extends { id: string }>(desligadas: T[], jaVistas: string[]): T[] {
  const vistas = new Set(jaVistas);
  return desligadas.filter((c) => !vistas.has(c.id));
}

function idsGuardados(valor: string | undefined): string[] | null {
  if (valor === undefined) return null;
  try {
    const v = JSON.parse(valor) as unknown;
    return Array.isArray(v) ? v.filter((i): i is string => typeof i === "string") : null;
  } catch {
    return null;
  }
}

/**
 * Emite o sinal das contas desligadas desde a última passada.
 *
 * A rotina guarda quais contas estavam desligadas e compara com as de agora,
 * em vez de olhar a data de alteração: mexer de novo numa conta já desligada
 * não repete o aviso, e não há relógio nem fuso para desencontrar. Conta
 * religada sai da lista, então desligá-la outra vez avisa outra vez.
 *
 * Na primeira vez só guarda a lista, e sem canal ligado guarda sem avisar:
 * mandar depois, como se fosse de agora, a conta desligada há uma semana seria
 * notícia velha.
 */
export async function avisarContasDesligadas(): Promise<number> {
  try {
    const guardado = idsGuardados((await prisma.rotinaEstado.findUnique({ where: { chave: MARCA } }))?.valor);
    const { rows } = await poolPortal().query<{ id: string; email: string | null }>(`select id::text as id, email from portal_clients where not ativo`);
    const novas = guardado ? recemDesligadas(rows, guardado) : [];
    const valor = JSON.stringify(rows.map((r) => r.id));
    // Guarda antes de avisar: se o processo cair no meio, o pior é um aviso a menos, nunca o mesmo aviso em laço.
    await prisma.rotinaEstado.upsert({ where: { chave: MARCA }, create: { chave: MARCA, valor }, update: { valor } });
    if (novas.length === 0 || (await prisma.ssfCanal.count({ where: { status: "enabled" } })) === 0) return 0;

    const emails = novas.flatMap((r) => (r.email ? [r.email] : []));
    for (const email of emails) {
      // Para quem ouve CAEP e para quem ouve RISC: a conta saiu, e as sessões dela também.
      const desligada = sinalDoEvento("conta_desligada");
      if (desligada) await emitirSinal(desligada, email);
      await emitirSinal({ tipo: EVENTO_SESSAO_REVOGADA, conteudo: desligada?.conteudo ?? {} }, email);
    }
    return emails.length;
  } catch (e) {
    if (!semTabela(e)) console.error("[ssf] varredura de contas desligadas falhou", e instanceof Error ? e.message : e);
    return 0;
  }
}

const ligada = globalThis as unknown as { rotinaDeSinais?: boolean };

/** De quanto em quanto tempo a rotina passa. `SSF_ROTINA_MS` existe para os testes. */
function intervalo(): number {
  const pedido = Number(process.env.SSF_ROTINA_MS);
  return Number.isFinite(pedido) && pedido >= 1000 ? pedido : 5 * 60 * 1000;
}

export function iniciarRotinaDeSinais(): void {
  if (ligada.rotinaDeSinais) return;
  ligada.rotinaDeSinais = true;
  let rodando = false;
  const rodar = async () => {
    if (rodando) return;
    rodando = true;
    try {
      await reenviarPendentes();
      await avisarContasDesligadas();
    } finally {
      rodando = false;
    }
  };
  setInterval(rodar, intervalo()).unref();
}
