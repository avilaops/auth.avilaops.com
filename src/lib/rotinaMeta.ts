import { randomUUID } from "node:crypto";
import { appMeta } from "@/lib/conexaoMeta";
import { cifrar, decifrar } from "@/lib/cripto";
import { registrar } from "@/lib/eventos";
import { renovarTokenMeta } from "@/lib/meta";
import { prisma } from "@/lib/prisma";
import { renovarLoteMeta } from "@/lib/renovacaoMeta";
import { passarWorkerMeta } from "@/lib/workerMeta";

const chave = (id: string) => `meta.renovacao:${id}`;
const LEASE_MS = 3 * 60 * 1000;

/** Uma linha por conexão; não guarda token, e-mail nem resposta da Graph. */
async function reservar(id: string, dia: string): Promise<string | null> {
  const valor = `${dia}:${randomUUID()}`;
  try {
    await prisma.rotinaEstado.create({ data: { chave: chave(id), valor } });
    return valor;
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
  }
  const anterior = await prisma.rotinaEstado.findUnique({ where: { chave: chave(id) } });
  if (!anterior || anterior.valor === `feito:${dia}`) return null;
  const pendente = !anterior.valor.startsWith("feito:");
  if (pendente && anterior.atualizadoEm.getTime() > Date.now() - LEASE_MS) return null;
  const trocada = await prisma.rotinaEstado.updateMany({
    where: { chave: chave(id), valor: anterior.valor, atualizadoEm: anterior.atualizadoEm },
    data: { valor },
  });
  return trocada.count === 1 ? valor : null;
}

export async function executarRotinaMeta(cursor: string | null, recorte?: { ate: Date; ultimoId: string }) {
  const app = await appMeta();
  if (!app) return null;
  return renovarLoteMeta({
    listar: (depois, limite, ate) => prisma.conexaoMeta.findMany({
      where: {
        expiraEm: { lte: recorte?.ate ?? ate },
        id: { ...(depois ? { gt: depois } : {}), ...(recorte ? { lte: recorte.ultimoId } : {}) },
      },
      orderBy: { id: "asc" }, take: limite,
      select: { id: true, email: true, tokenEnc: true, expiraEm: true },
    }),
    reservar,
    concluir: async (id, reserva, dia, feita) => {
      const where = { chave: chave(id), valor: reserva };
      if (feita) await prisma.rotinaEstado.updateMany({ where, data: { valor: `feito:${dia}` } });
      else await prisma.rotinaEstado.deleteMany({ where });
    },
    renovar: async (c) => {
      const novo = await renovarTokenMeta({
        clientId: app.clientId, clientSecret: app.clientSecret, token: decifrar(c.tokenEnc),
        buscar: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }),
      });
      return { tokenEnc: cifrar(novo.token), expiraEm: novo.expiraEm };
    },
    gravar: async (c, novo) => (await prisma.conexaoMeta.updateMany({
      where: { id: c.id, tokenEnc: c.tokenEnc, expiraEm: c.expiraEm }, data: novo,
    })).count === 1,
    registrar: (tipo, email, detalhe) => registrar({ tipo, email, detalhe, autor: "rotina:n8n-meta" }),
  });
}

const ESTADO_WORKER = "meta.renovacao.worker.v1";

export async function continuarRotinaMeta() {
  return passarWorkerMeta({
    ler: async () => (await prisma.rotinaEstado.findUnique({ where: { chave: ESTADO_WORKER } }))?.valor ?? null,
    trocar: async (anterior, valor) => {
      if (anterior === null) {
        try {
          await prisma.rotinaEstado.create({ data: { chave: ESTADO_WORKER, valor } });
          return true;
        } catch (e) {
          if ((e as { code?: string }).code === "P2002") return false;
          throw e;
        }
      }
      return (await prisma.rotinaEstado.updateMany({ where: { chave: ESTADO_WORKER, valor: anterior }, data: { valor } })).count === 1;
    },
    ultimoId: async (ate) => {
      // Conector indisponível é erro, inclusive quando o lote está vazio.
      if (!(await appMeta())) throw new Error("Conexão Meta indisponível");
      return (await prisma.conexaoMeta.findFirst({ where: { expiraEm: { lte: ate } }, orderBy: { id: "desc" }, select: { id: true } }))?.id ?? null;
    },
    executar: async (cursor, ate, ultimoId) => {
      const resumo = await executarRotinaMeta(cursor, { ate, ultimoId });
      if (!resumo) throw new Error("Conexão Meta indisponível");
      return resumo;
    },
  });
}
