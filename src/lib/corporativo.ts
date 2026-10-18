import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const CONTRATO_CORPORATIVO = "avila.corporativo.v1" as const;
export const CONTRATO_PROVISIONAMENTO_CORPORATIVO = "avila.corporativo.v2" as const;

export class ContratoCorporativoLegadoEncerrado extends Error {}

export const PAPEIS_CORPORATIVOS = [
  "ADMINISTRADOR",
  "COMPRADOR",
  "APROVADOR",
  "FINANCEIRO",
  "VENDEDOR",
] as const;

export type PapelCorporativo = (typeof PAPEIS_CORPORATIVOS)[number];

export const SITUACOES_CORPORATIVAS = ["ATIVO", "SUSPENSO", "REVOGADO"] as const;
export type SituacaoCorporativa = (typeof SITUACOES_CORPORATIVAS)[number];

export function normalizarPapelCorporativo(valor: unknown): PapelCorporativo | null {
  return typeof valor === "string" && PAPEIS_CORPORATIVOS.includes(valor as PapelCorporativo)
    ? (valor as PapelCorporativo)
    : null;
}

export function normalizarSituacaoCorporativa(valor: unknown): SituacaoCorporativa | null {
  return typeof valor === "string" && SITUACOES_CORPORATIVAS.includes(valor as SituacaoCorporativa)
    ? (valor as SituacaoCorporativa)
    : null;
}

/** `undefined` é inválido; `null` é a ausência explícita de alçada. */
export function normalizarAlcadaCentavos(valor: unknown): number | null | undefined {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 0 ? valor : undefined;
}

export function autorizacaoAlcancaUnidade(
  autorizacao: { unidadeId: string | null },
  unidadeId: string | null,
): boolean {
  return autorizacao.unidadeId === null || (unidadeId !== null && autorizacao.unidadeId === unidadeId);
}

export type AutorizacaoProvisionada = {
  papel: PapelCorporativo;
  referenciaUnidade: string | null;
  limiteAprovacaoCentavos: number | null;
};

export type EntradaContextoCorporativo = {
  clienteId: string;
  referenciaOrganizacao: string;
  nomeOrganizacao: string;
  contaId: string;
  contaEmail: string;
  convidadoPor?: string | null;
  unidades: Array<{ referencia: string; nome: string }>;
  autorizacoes: AutorizacaoProvisionada[];
  autor: string;
  intencaoVersao?: number | null;
  organizacaoVersao?: number | null;
};

export type PedidoDeProvisionamentoCorporativo = Omit<EntradaContextoCorporativo, "clienteId" | "contaId" | "contaEmail" | "autor"> & {
  contrato: typeof CONTRATO_CORPORATIVO | typeof CONTRATO_PROVISIONAMENTO_CORPORATIVO;
  email: string;
};

function textoDoPedido(valor: unknown, max: number): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  return texto && texto.length <= max ? texto : null;
}

export function lerPedidoDeProvisionamentoCorporativo(valor: unknown): PedidoDeProvisionamentoCorporativo | null {
  if (!valor || typeof valor !== "object") return null;
  const corpo = valor as Record<string, unknown>;
  if (corpo.versao !== CONTRATO_CORPORATIVO && corpo.versao !== CONTRATO_PROVISIONAMENTO_CORPORATIVO) return null;
  const contrato = corpo.versao;
  const intencaoVersao = contrato === CONTRATO_PROVISIONAMENTO_CORPORATIVO ? corpo.intencaoVersao : null;
  const organizacaoVersao = contrato === CONTRATO_PROVISIONAMENTO_CORPORATIVO ? corpo.organizacaoVersao : null;
  if (contrato === CONTRATO_PROVISIONAMENTO_CORPORATIVO && (
    !Number.isSafeInteger(intencaoVersao) || Number(intencaoVersao) <= 0
    || !Number.isSafeInteger(organizacaoVersao) || Number(organizacaoVersao) <= 0
  )) return null;
  const email = textoDoPedido(corpo.email, 254)?.toLowerCase() ?? null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (!corpo.organizacao || typeof corpo.organizacao !== "object") return null;
  const organizacao = corpo.organizacao as Record<string, unknown>;
  const referenciaOrganizacao = textoDoPedido(organizacao.referencia, 200);
  const nomeOrganizacao = textoDoPedido(organizacao.nome, 160);
  if (!referenciaOrganizacao || !nomeOrganizacao || !Array.isArray(corpo.unidades) || !Array.isArray(corpo.autorizacoes)) return null;

  const unidades: Array<{ referencia: string; nome: string }> = [];
  for (const item of corpo.unidades) {
    if (!item || typeof item !== "object") return null;
    const unidade = item as Record<string, unknown>;
    const referencia = textoDoPedido(unidade.referencia, 200);
    const nome = textoDoPedido(unidade.nome, 160);
    if (!referencia || !nome) return null;
    unidades.push({ referencia, nome });
  }
  if (new Set(unidades.map((u) => u.referencia)).size !== unidades.length) return null;

  const autorizacoes: AutorizacaoProvisionada[] = [];
  for (const item of corpo.autorizacoes) {
    if (!item || typeof item !== "object") return null;
    const autorizacao = item as Record<string, unknown>;
    const papel = normalizarPapelCorporativo(autorizacao.papel);
    const referenciaUnidade = autorizacao.referenciaUnidade === null ? null : textoDoPedido(autorizacao.referenciaUnidade, 200);
    const limiteAprovacaoCentavos = normalizarAlcadaCentavos(autorizacao.limiteAprovacaoCentavos);
    if (!papel || (referenciaUnidade === null && autorizacao.referenciaUnidade !== null) || limiteAprovacaoCentavos === undefined) return null;
    if (referenciaUnidade !== null && !unidades.some((u) => u.referencia === referenciaUnidade)) return null;
    autorizacoes.push({ papel, referenciaUnidade, limiteAprovacaoCentavos });
  }
  if (autorizacoes.length === 0) return null;
  if (new Set(autorizacoes.map((a) => `${a.referenciaUnidade ?? "organizacao"}:${a.papel}`)).size !== autorizacoes.length) return null;

  const convidadoPor = corpo.convidadoPor === undefined || corpo.convidadoPor === null ? null : textoDoPedido(corpo.convidadoPor, 160);
  if (corpo.convidadoPor !== undefined && corpo.convidadoPor !== null && !convidadoPor) return null;
  return {
    contrato,
    email,
    intencaoVersao: intencaoVersao === null ? null : Number(intencaoVersao),
    organizacaoVersao: organizacaoVersao === null ? null : Number(organizacaoVersao),
    referenciaOrganizacao,
    nomeOrganizacao,
    unidades,
    autorizacoes,
    convidadoPor,
  };
}

export type ContextoCorporativo = {
  contrato: typeof CONTRATO_CORPORATIVO;
  organizacaoId: string;
  vinculoId: string;
  referenciaExterna: string;
  nome: string;
  versao: number;
  autorizacoesOrganizacao: Array<{ papel: PapelCorporativo; limiteAprovacaoCentavos: number | null }>;
  unidades: Array<{
    id: string;
    referenciaExterna: string;
    nome: string;
    autorizacoes: Array<{ papel: PapelCorporativo; limiteAprovacaoCentavos: number | null }>;
  }>;
};

function textoObrigatorio(valor: string, campo: string, max = 200): string {
  const texto = valor.trim();
  if (!texto || texto.length > max) throw new Error(`${campo} inválido`);
  return texto;
}

function chaveAutorizacao(a: { papel: string; unidadeId: string | null; limiteAprovacaoCentavos: number | null }): string {
  return `${a.unidadeId ?? "organizacao"}:${a.papel}:${a.limiteAprovacaoCentavos ?? "sem-limite"}`;
}

function conjuntosIguais(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
}

export async function provisionarContextoCorporativo(entrada: EntradaContextoCorporativo) {
  const clienteId = textoObrigatorio(entrada.clienteId, "clienteId", 120);
  const referenciaOrganizacao = textoObrigatorio(entrada.referenciaOrganizacao, "referenciaOrganizacao");
  const nomeOrganizacao = textoObrigatorio(entrada.nomeOrganizacao, "nomeOrganizacao", 160);
  const contaId = textoObrigatorio(entrada.contaId, "contaId");
  const contaEmail = textoObrigatorio(entrada.contaEmail, "contaEmail", 254).toLowerCase();
  const legado = entrada.intencaoVersao == null && entrada.organizacaoVersao == null;
  if (!legado && (
    !Number.isSafeInteger(entrada.intencaoVersao) || Number(entrada.intencaoVersao) <= 0
    || !Number.isSafeInteger(entrada.organizacaoVersao) || Number(entrada.organizacaoVersao) <= 0
  )) throw new Error("versão da intenção inválida");
  const intencaoVersao = legado ? null : Number(entrada.intencaoVersao);
  const organizacaoVersao = legado ? null : Number(entrada.organizacaoVersao);
  const unidades = entrada.unidades.map((u) => ({ referencia: textoObrigatorio(u.referencia, "referenciaUnidade"), nome: textoObrigatorio(u.nome, "nomeUnidade", 160) }));
  if (new Set(unidades.map((u) => u.referencia)).size !== unidades.length) throw new Error("unidade repetida");
  if (entrada.autorizacoes.length === 0) throw new Error("informe ao menos uma autorização");
  for (const a of entrada.autorizacoes) {
    if (!normalizarPapelCorporativo(a.papel)) throw new Error("papel corporativo inválido");
    if (normalizarAlcadaCentavos(a.limiteAprovacaoCentavos) === undefined) throw new Error("alçada inválida");
    if (a.referenciaUnidade !== null && !unidades.some((u) => u.referencia === a.referenciaUnidade)) throw new Error("unidade da autorização não informada");
  }
  if (new Set(entrada.autorizacoes.map((a) => `${a.referenciaUnidade ?? "organizacao"}:${a.papel}`)).size !== entrada.autorizacoes.length) {
    throw new Error("autorização repetida");
  }

  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      return await prisma.$transaction(async (tx) => {
        let mudou = false;
        let organizacao = await tx.organizacaoCorporativa.findUnique({
          where: { clienteId_referenciaExterna: { clienteId, referenciaExterna: referenciaOrganizacao } },
        });
        if (organizacao && legado && organizacao.provisionamentoV2) throw new ContratoCorporativoLegadoEncerrado("A organização já usa o provisionamento corporativo v2.");
        const organizacaoCriada = !organizacao;
        if (!organizacao) {
          organizacao = await tx.organizacaoCorporativa.create({
            data: { clienteId, referenciaExterna: referenciaOrganizacao, nome: nomeOrganizacao, ultimaIntencaoVersao: organizacaoVersao ?? 0, provisionamentoV2: !legado },
          });
          mudou = true;
        } else if (!legado && !organizacao.provisionamentoV2) {
          organizacao = await tx.organizacaoCorporativa.update({ where: { id: organizacao.id }, data: { provisionamentoV2: true } });
        }

        const existentes = await tx.unidadeCorporativa.findMany({ where: { organizacaoId: organizacao.id } });
        const unidadesPorReferencia = new Map(existentes.map((u) => [u.referenciaExterna, u]));
        const aplicaOrganizacao = organizacaoCriada || (organizacao.ultimaIntencaoVersao === 0
          ? legado || organizacaoVersao !== null
          : organizacaoVersao !== null && organizacaoVersao > organizacao.ultimaIntencaoVersao);
        if (aplicaOrganizacao) {
          if (organizacao.nome !== nomeOrganizacao || organizacao.situacao !== "ATIVO" || organizacao.ultimaIntencaoVersao !== (organizacaoVersao ?? 0)) {
            organizacao = await tx.organizacaoCorporativa.update({
              where: { id: organizacao.id },
              data: { nome: nomeOrganizacao, situacao: "ATIVO", ultimaIntencaoVersao: organizacaoVersao ?? 0 },
            });
            mudou = true;
          }
          for (const desejada of unidades) {
            const atual = unidadesPorReferencia.get(desejada.referencia);
            if (!atual) {
              const criada = await tx.unidadeCorporativa.create({ data: { organizacaoId: organizacao.id, referenciaExterna: desejada.referencia, nome: desejada.nome } });
              unidadesPorReferencia.set(desejada.referencia, criada);
              mudou = true;
            } else if (atual.nome !== desejada.nome || atual.situacao !== "ATIVO") {
              const atualizada = await tx.unidadeCorporativa.update({ where: { id: atual.id }, data: { nome: desejada.nome, situacao: "ATIVO" } });
              unidadesPorReferencia.set(desejada.referencia, atualizada);
              mudou = true;
            }
          }
          const omitidas = existentes.filter((u) => u.situacao === "ATIVO" && !unidades.some((d) => d.referencia === u.referenciaExterna));
          if (omitidas.length) {
            await tx.unidadeCorporativa.updateMany({ where: { id: { in: omitidas.map((u) => u.id) } }, data: { situacao: "SUSPENSO" } });
            for (const omitida of omitidas) unidadesPorReferencia.set(omitida.referenciaExterna, { ...omitida, situacao: "SUSPENSO" });
            mudou = true;
          }
        }

        let vinculo = await tx.vinculoCorporativo.findUnique({ where: { organizacaoId_contaId: { organizacaoId: organizacao.id, contaId } } });
        const aplicaVinculo = !vinculo || (vinculo.ultimaIntencaoVersao === 0 ? legado || intencaoVersao !== null : intencaoVersao !== null && intencaoVersao > vinculo.ultimaIntencaoVersao);
        if (vinculo && !aplicaVinculo) {
          return {
            organizacaoId: organizacao.id,
            vinculoId: vinculo.id,
            versao: organizacao.versao,
            intencaoVersaoAplicada: vinculo.ultimaIntencaoVersao,
            organizacaoVersaoAplicada: organizacao.ultimaIntencaoVersao,
          };
        }
        if (!vinculo) {
          vinculo = await tx.vinculoCorporativo.create({ data: { organizacaoId: organizacao.id, contaId, convidadoPor: entrada.convidadoPor?.trim() || null, ultimaIntencaoVersao: intencaoVersao ?? 0 } });
          mudou = true;
        } else {
          const reativou = vinculo.situacao !== "ATIVO" || vinculo.convidadoPor !== (entrada.convidadoPor?.trim() || null);
          vinculo = await tx.vinculoCorporativo.update({ where: { id: vinculo.id }, data: { situacao: "ATIVO", revogadoEm: null, convidadoPor: entrada.convidadoPor?.trim() || null, ultimaIntencaoVersao: intencaoVersao ?? 0 } });
          mudou ||= reativou;
        }

        const desejadas = entrada.autorizacoes.map((a) => {
          const unidade = a.referenciaUnidade === null ? null : unidadesPorReferencia.get(a.referenciaUnidade);
          if (a.referenciaUnidade !== null && unidade?.situacao !== "ATIVO") throw new Error("unidade da autorização não está ativa");
          return {
            papel: a.papel,
            unidadeId: unidade?.id ?? null,
            limiteAprovacaoCentavos: a.limiteAprovacaoCentavos,
          };
        });
        const atuais = await tx.autorizacaoCorporativa.findMany({ where: { vinculoId: vinculo.id } });
        if (!conjuntosIguais(atuais.map(chaveAutorizacao), desejadas.map(chaveAutorizacao))) {
          await tx.autorizacaoCorporativa.deleteMany({ where: { vinculoId: vinculo.id } });
          await tx.autorizacaoCorporativa.createMany({ data: desejadas.map((a) => ({ vinculoId: vinculo.id, ...a })) });
          mudou = true;
        }

        if (mudou && (existentes.length > 0 || atuais.length > 0)) {
          organizacao = await tx.organizacaoCorporativa.update({ where: { id: organizacao.id }, data: { versao: { increment: 1 } } });
        }

        if (mudou) {
          await tx.evento.create({ data: { tipo: "contexto_corporativo_provisionado", email: contaEmail, appId: clienteId, autor: entrada.autor, detalhe: JSON.stringify({ contaId, organizacaoId: organizacao.id, vinculoId: vinculo.id, versao: organizacao.versao, autorizacoes: entrada.autorizacoes }) } });
        }
        return {
          organizacaoId: organizacao.id,
          vinculoId: vinculo.id,
          versao: organizacao.versao,
          intencaoVersaoAplicada: vinculo.ultimaIntencaoVersao,
          organizacaoVersaoAplicada: organizacao.ultimaIntencaoVersao,
        };
      }, { isolationLevel: "Serializable" });
    } catch (erro) {
      if (tentativa < 3 && erro instanceof Prisma.PrismaClientKnownRequestError && (erro.code === "P2034" || erro.code === "P2002")) continue;
      throw erro;
    }
  }
  throw new Error("não foi possível provisionar o contexto corporativo");
}

export async function listarContextosCorporativos(contaId: string, clienteId: string): Promise<ContextoCorporativo[]> {
  const vinculos = await prisma.vinculoCorporativo.findMany({
    where: { contaId, situacao: "ATIVO", organizacao: { clienteId, situacao: "ATIVO" } },
    include: {
      organizacao: { include: { unidades: { where: { situacao: "ATIVO" }, orderBy: [{ nome: "asc" }, { id: "asc" }] } } },
      autorizacoes: true,
    },
    orderBy: [{ organizacao: { nome: "asc" } }, { id: "asc" }],
  });
  return vinculos.map((v) => {
    const organizacionais = v.autorizacoes.filter((a) => a.unidadeId === null);
    return {
      contrato: CONTRATO_CORPORATIVO,
      organizacaoId: v.organizacao.id,
      vinculoId: v.id,
      referenciaExterna: v.organizacao.referenciaExterna,
      nome: v.organizacao.nome,
      versao: v.organizacao.versao,
      autorizacoesOrganizacao: organizacionais.map((a) => ({ papel: a.papel as PapelCorporativo, limiteAprovacaoCentavos: a.limiteAprovacaoCentavos })),
      unidades: v.organizacao.unidades
        .map((u) => ({
          id: u.id,
          referenciaExterna: u.referenciaExterna,
          nome: u.nome,
          autorizacoes: v.autorizacoes.filter((a) => a.unidadeId === u.id).map((a) => ({ papel: a.papel as PapelCorporativo, limiteAprovacaoCentavos: a.limiteAprovacaoCentavos })),
        }))
        .filter((u) => organizacionais.length > 0 || u.autorizacoes.length > 0),
    };
  });
}

export async function alterarSituacaoDoVinculo(entrada: {
  clienteId: string;
  referenciaOrganizacao: string;
  contaId: string;
  contaEmail: string;
  situacao: Exclude<SituacaoCorporativa, "ATIVO">;
  autor: string;
  intencaoVersao: number | null;
}): Promise<{ intencaoVersaoAplicada: number } | null> {
  return prisma.$transaction(async (tx) => {
    const organizacao = await tx.organizacaoCorporativa.findUnique({ where: { clienteId_referenciaExterna: { clienteId: entrada.clienteId, referenciaExterna: entrada.referenciaOrganizacao } } });
    if (!organizacao) return null;
    const legado = entrada.intencaoVersao === null;
    if (legado && organizacao.provisionamentoV2) throw new ContratoCorporativoLegadoEncerrado("A organização já usa o provisionamento corporativo v2.");
    if (!legado && !organizacao.provisionamentoV2) {
      await tx.organizacaoCorporativa.update({ where: { id: organizacao.id }, data: { provisionamentoV2: true } });
    }
    const vinculo = await tx.vinculoCorporativo.findUnique({ where: { organizacaoId_contaId: { organizacaoId: organizacao.id, contaId: entrada.contaId } } });
    if (!vinculo) return null;
    if (!legado && (!Number.isSafeInteger(entrada.intencaoVersao) || Number(entrada.intencaoVersao) <= 0)) throw new Error("versão da intenção inválida");
    if ((legado && vinculo.ultimaIntencaoVersao > 0) || (!legado && Number(entrada.intencaoVersao) <= vinculo.ultimaIntencaoVersao)) {
      return { intencaoVersaoAplicada: vinculo.ultimaIntencaoVersao };
    }
    await tx.vinculoCorporativo.update({ where: { id: vinculo.id }, data: { situacao: entrada.situacao, revogadoEm: entrada.situacao === "REVOGADO" ? new Date() : null, ultimaIntencaoVersao: entrada.intencaoVersao ?? 0 } });
    await tx.organizacaoCorporativa.update({ where: { id: organizacao.id }, data: { versao: { increment: 1 } } });
    await tx.evento.create({ data: { tipo: entrada.situacao === "REVOGADO" ? "vinculo_corporativo_revogado" : "vinculo_corporativo_suspenso", email: entrada.contaEmail.trim().toLowerCase(), appId: entrada.clienteId, autor: entrada.autor, detalhe: JSON.stringify({ contaId: entrada.contaId, organizacaoId: organizacao.id, vinculoId: vinculo.id }) } });
    return { intencaoVersaoAplicada: entrada.intencaoVersao ?? 0 };
  }, { isolationLevel: "Serializable" });
}
