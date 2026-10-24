import { randomUUID } from "node:crypto";
import { ANTECEDENCIA_META_MS, type ResumoRenovacao } from "@/lib/renovacaoMeta";

export const LEASE_WORKER_META_MS = 3 * 60 * 1000;
export const INTERVALO_VARREDURA_META_MS = 60 * 60 * 1000;

export type EstadoWorkerMeta = {
  cursor: string | null;
  ate: number | null;
  ultimoId: string | null;
  proximaEm: number;
  leaseAte: number;
  dono: string | null;
};
export type ResumoWorkerMeta = ResumoRenovacao & {
  continuacaoPendente: boolean;
  ocupada: boolean;
  proximaEm: number;
};
export type DependenciasWorkerMeta = {
  ler: () => Promise<string | null>;
  /** Compare-and-swap; null significa criar somente se a chave não existir. */
  trocar: (anterior: string | null, valor: string) => Promise<boolean>;
  ultimoId: (ate: Date) => Promise<string | null>;
  executar: (cursor: string | null, ate: Date, ultimoId: string) => Promise<ResumoRenovacao>;
};

function lerEstado(valor: string | null): EstadoWorkerMeta {
  if (valor === null) return { cursor: null, ate: null, ultimoId: null, proximaEm: 0, leaseAte: 0, dono: null };
  const e = JSON.parse(valor) as EstadoWorkerMeta;
  const texto = (v: unknown) => v === null || (typeof v === "string" && v.length > 0);
  if (!e || !texto(e.cursor) || !texto(e.ultimoId) || !texto(e.dono) ||
      !(e.ate === null || (Number.isFinite(e.ate) && e.ate >= 0)) ||
      !Number.isFinite(e.proximaEm) || !Number.isFinite(e.leaseAte) ||
      (e.cursor !== null && (e.ate === null || e.ultimoId === null))) {
    throw new Error("Estado da rotina Meta inválido");
  }
  return e;
}

function vazio(e: EstadoWorkerMeta, ocupada: boolean): ResumoWorkerMeta {
  return {
    examinadas: 0, renovadas: 0, vencidas: 0, falhas: 0, ignoradas: 0,
    proximoCursor: null, continuacaoPendente: e.ultimoId !== null,
    ocupada, proximaEm: ocupada ? e.leaseAte : e.proximaEm,
  };
}

/**
 * Uma passagem limitada por requisição. O banco guarda o progresso, não o
 * n8n: reiniciar o workflow ou perder a resposta não reinicia a varredura.
 * O teto da varredura é congelado para novas conexões não prolongarem a rodada.
 */
export async function passarWorkerMeta(deps: DependenciasWorkerMeta, agora = Date.now()): Promise<ResumoWorkerMeta> {
  let anterior = await deps.ler();
  const estado = lerEstado(anterior);
  if (estado.leaseAte > agora) return vazio(estado, true);
  if (estado.proximaEm > agora) return vazio(estado, false);
  estado.leaseAte = agora + LEASE_WORKER_META_MS;
  estado.dono = randomUUID();
  let reservado = JSON.stringify(estado);
  if (!(await deps.trocar(anterior, reservado))) return vazio(estado, true);

  const salvar = async () => {
    const proximo = JSON.stringify(estado);
    if (!(await deps.trocar(reservado, proximo))) throw new Error("Reserva da rotina Meta perdida");
    reservado = proximo;
  };
  try {
    if (estado.ate === null) {
      estado.ate = agora + ANTECEDENCIA_META_MS;
      estado.ultimoId = await deps.ultimoId(new Date(estado.ate));
      await salvar();
    }
    let resumo: ResumoRenovacao = { examinadas: 0, renovadas: 0, vencidas: 0, falhas: 0, ignoradas: 0, proximoCursor: null };
    if (estado.ultimoId !== null) {
      resumo = await deps.executar(estado.cursor, new Date(estado.ate), estado.ultimoId);
      if (resumo.proximoCursor !== null &&
          ((estado.cursor !== null && resumo.proximoCursor <= estado.cursor) || resumo.proximoCursor > estado.ultimoId)) {
        throw new Error("Cursor da rotina Meta não avançou");
      }
    }
    estado.cursor = resumo.proximoCursor;
    const continuacaoPendente = estado.cursor !== null;
    if (!continuacaoPendente) {
      estado.ate = null;
      estado.ultimoId = null;
      estado.proximaEm = agora + INTERVALO_VARREDURA_META_MS;
    }
    estado.leaseAte = 0;
    estado.dono = null;
    await salvar();
    return { ...resumo, proximoCursor: null, continuacaoPendente, ocupada: false, proximaEm: estado.proximaEm };
  } catch (erro) {
    // Mantém o último cursor confirmado. A reserva expira se o banco cair.
    anterior = reservado;
    const anteriorEstado = lerEstado(anterior);
    anteriorEstado.leaseAte = 0;
    anteriorEstado.dono = null;
    await deps.trocar(anterior, JSON.stringify(anteriorEstado)).catch(() => false);
    throw erro;
  }
}
