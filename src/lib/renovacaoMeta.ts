import { timingSafeEqual } from "node:crypto";

const DIA_MS = 24 * 60 * 60 * 1000;
export const ANTECEDENCIA_META_MS = 15 * DIA_MS;
export const TAMANHO_LOTE_META = 10;

/** A rotina não aceita cookie de usuário nem recebe tokens da Meta. */
export function autenticarRotinaMeta(recebido: string | null, segredo: string | undefined): boolean {
  if (!segredo || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(segredo);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type ConexaoParaRenovar = { id: string; email: string; tokenEnc: string; expiraEm: Date | null };
export type ResumoRenovacao = {
  examinadas: number;
  renovadas: number;
  vencidas: number;
  falhas: number;
  ignoradas: number;
  proximoCursor: string | null;
};

export type DependenciasRenovacao = {
  listar: (cursor: string | null, limite: number, ate: Date) => Promise<ConexaoParaRenovar[]>;
  reservar: (id: string, dia: string) => Promise<string | null>;
  concluir: (id: string, reserva: string, dia: string, feita: boolean) => Promise<void>;
  renovar: (c: ConexaoParaRenovar) => Promise<{ tokenEnc: string; expiraEm: Date | null }>;
  gravar: (c: ConexaoParaRenovar, novo: { tokenEnc: string; expiraEm: Date | null }) => Promise<boolean>;
  registrar: (tipo: "meta_token_renovado" | "meta_falhou", email: string, detalhe: string) => Promise<void>;
};

/**
 * Uma página por chamada. Uma conexão com problema não segura as outras.
 * Reserva diária persistente impede repetição após timeout do chamador;
 * falhas liberam a reserva, permitindo recuperação na próxima execução.
 */
export async function renovarLoteMeta(
  deps: DependenciasRenovacao,
  cursor: string | null = null,
  agora = new Date(),
): Promise<ResumoRenovacao> {
  const dia = agora.toISOString().slice(0, 10);
  const linhas = await deps.listar(cursor, TAMANHO_LOTE_META + 1, new Date(agora.getTime() + ANTECEDENCIA_META_MS));
  const lote = linhas.slice(0, TAMANHO_LOTE_META);
  const resumo: ResumoRenovacao = {
    examinadas: lote.length, renovadas: 0, vencidas: 0, falhas: 0, ignoradas: 0,
    proximoCursor: linhas.length > TAMANHO_LOTE_META ? lote.at(-1)!.id : null,
  };
  for (const c of lote) {
    if (!c.expiraEm || c.expiraEm.getTime() > agora.getTime() + ANTECEDENCIA_META_MS) {
      resumo.ignoradas++;
      continue;
    }
    const reserva = await deps.reservar(c.id, dia);
    if (!reserva) {
      resumo.ignoradas++;
      continue;
    }
    let feita = false;
    try {
      if (c.expiraEm.getTime() <= agora.getTime()) {
        await deps.registrar("meta_falhou", c.email, "Conexão vencida; reconectar em conta.avilaops.com/conta/meta.");
        resumo.vencidas++;
        feita = true;
        continue;
      }
      const novo = await deps.renovar(c);
      // Uma resposta incompleta não transforma validade conhecida em eterna.
      if (!novo.expiraEm || novo.expiraEm.getTime() < c.expiraEm.getTime()) {
        throw new Error("Validade da renovação inválida");
      }
      if (await deps.gravar(c, novo)) {
        await deps.registrar("meta_token_renovado", c.email, "Renovação diária pelo n8n.");
        resumo.renovadas++;
      } else {
        // A pessoa desconectou/reautorizou enquanto a Graph respondia.
        resumo.ignoradas++;
      }
      feita = true;
    } catch {
      resumo.falhas++;
      // Mensagens da Graph podem conter dados sensíveis: só texto fixo.
      await deps.registrar("meta_falhou", c.email, "Renovação diária falhou; nova execução pode tentar novamente.");
    } finally {
      await deps.concluir(c.id, reserva, dia, feita);
    }
  }
  return resumo;
}
