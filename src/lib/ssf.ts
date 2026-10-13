import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { chaveDeAssinatura, type ChaveDeAssinatura } from "@/lib/chaveOidc";
import { cifrar, decifrar } from "@/lib/cripto";
import { EMISSOR } from "@/lib/oidc";
import { prisma } from "@/lib/prisma";
import { baseUrl } from "@/lib/urls";

/**
 * Transmissor do Shared Signals Framework (OpenID SSF 1.0).
 *
 * O login único diz a um sistema quem é a pessoa na hora em que ela entra. O
 * SSF é o caminho de volta: o Auth avisa esse sistema, depois, quando algo
 * muda na conta (a pessoa saiu, trocou a senha, mexeu no segundo fator). O
 * Apple Business exige isso de um provedor de identidade personalizado.
 *
 * Como funciona:
 *
 * - o receptor entra pelo OIDC com os escopos `ssf.manage` e `ssf.read` (ver
 *   `escopoConcedido`) e, com o access token, cria **um canal** dizendo para
 *   onde quer receber (`POST /ssf/stream`);
 * - cada evento vira um SET (JWT `secevent+jwt`, RS256, conferível pelo mesmo
 *   `/oauth/jwks` do `id_token`) empurrado para o endereço do canal (RFC 8935).
 *
 * Só entrega por push. A entrega por consulta (RFC 8936) não existe: nenhum
 * receptor pediu, e ela obrigaria a guardar fila de eventos.
 *
 * Os eventos saem para **todas** as contas (`default_subjects: ALL`): o
 * receptor ignora quem ele não conhece. Por isso abrir canal é permissão de
 * integração marcada no painel, e só quem é da equipe da casa autoriza.
 *
 * Sem a chave de assinatura (falta `AUTH_ENCRYPTION_KEY`) nada é enviado: um
 * SET sem assinatura conferível não vale nada para quem recebe.
 */

export const ENTREGA_PUSH = "urn:ietf:rfc:8935";
export const EVENTO_VERIFICACAO = "https://schemas.openid.net/secevent/ssf/event-type/verification";
export const EVENTO_SESSAO_REVOGADA = "https://schemas.openid.net/secevent/caep/event-type/session-revoked";
export const EVENTO_CREDENCIAL_MUDOU = "https://schemas.openid.net/secevent/caep/event-type/credential-change";
/** O que este transmissor sabe emitir, fora a verificação (que vale sempre). */
export const EVENTOS_SUPORTADOS = [EVENTO_SESSAO_REVOGADA, EVENTO_CREDENCIAL_MUDOU] as const;

const TEMPO_LIMITE_MS = 5000;

/** O documento de `/.well-known/ssf-configuration`. */
export function configuracaoSsf() {
  const base = baseUrl();
  return {
    spec_version: "1_0",
    issuer: EMISSOR,
    jwks_uri: `${base}/oauth/jwks`,
    delivery_methods_supported: [ENTREGA_PUSH],
    configuration_endpoint: `${base}/ssf/stream`,
    status_endpoint: `${base}/ssf/status`,
    add_subject_endpoint: `${base}/ssf/subjects/add`,
    remove_subject_endpoint: `${base}/ssf/subjects/remove`,
    verification_endpoint: `${base}/ssf/verify`,
    authorization_schemes: [{ spec_urn: "urn:ietf:rfc:6749" }],
    default_subjects: "ALL",
  };
}

export type EntradaDoCanal = { endpointUrl: string; autorizacao: string | null; eventosPedidos: string[]; descricao: string | null };
export type Validacao = { ok: true; dados: EntradaDoCanal } | { ok: false; erro: string };

/**
 * Confere o que o receptor mandou para criar ou substituir o canal.
 *
 * O endereço de entrega recebe eventos de todas as contas, então segue a regra
 * dos outros endereços de saída do Auth: só `https`.
 */
export function validarCanal(corpo: unknown): Validacao {
  if (typeof corpo !== "object" || corpo === null) return { ok: false, erro: "Corpo inválido." };
  const c = corpo as { delivery?: { method?: unknown; endpoint_url?: unknown; authorization_header?: unknown }; events_requested?: unknown; description?: unknown };

  if (!c.delivery || typeof c.delivery !== "object") return { ok: false, erro: "Informe `delivery`: este transmissor só entrega por push (urn:ietf:rfc:8935)." };
  if (c.delivery.method !== ENTREGA_PUSH) return { ok: false, erro: "Método de entrega não suportado. Só urn:ietf:rfc:8935 (push)." };
  if (typeof c.delivery.endpoint_url !== "string") return { ok: false, erro: "`delivery.endpoint_url` ausente." };
  let url: URL;
  try {
    url = new URL(c.delivery.endpoint_url);
  } catch {
    return { ok: false, erro: "`delivery.endpoint_url` inválido." };
  }
  if (url.protocol !== "https:" || url.hash) return { ok: false, erro: "`delivery.endpoint_url` precisa ser https, sem fragmento." };

  const autorizacao = c.delivery.authorization_header;
  if (autorizacao !== undefined && autorizacao !== null && (typeof autorizacao !== "string" || autorizacao.length > 4096 || /[\r\n]/.test(autorizacao))) {
    return { ok: false, erro: "`delivery.authorization_header` inválido." };
  }
  const eventos = c.events_requested ?? [];
  if (!Array.isArray(eventos) || eventos.length > 50 || eventos.some((e) => typeof e !== "string" || e.length > 300)) {
    return { ok: false, erro: "`events_requested` precisa ser uma lista de tipos de evento." };
  }
  const descricao = typeof c.description === "string" ? c.description.slice(0, 500) : null;
  return { ok: true, dados: { endpointUrl: url.toString(), autorizacao: typeof autorizacao === "string" && autorizacao ? autorizacao : null, eventosPedidos: eventos as string[], descricao } };
}

/** Do que foi pedido, o que este transmissor de fato entrega. */
export function eventosEntregues(pedidos: string[]): string[] {
  return EVENTOS_SUPORTADOS.filter((e) => pedidos.includes(e));
}

export const STATUS_DO_CANAL = ["enabled", "paused", "disabled"] as const;
export type StatusDoCanal = (typeof STATUS_DO_CANAL)[number];

type Linha = { id: string; clienteId: string; endpointUrl: string; autorizacaoEnc: string | null; eventosPedidos: string; descricao: string | null; status: string; motivo: string | null };

function pedidosDe(l: Pick<Linha, "eventosPedidos">): string[] {
  try {
    const v = JSON.parse(l.eventosPedidos) as unknown;
    return Array.isArray(v) ? v.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

/** O canal como o receptor o vê (configuração do stream). O cabeçalho de autorização nunca volta. */
export function canalParaOReceptor(l: Linha) {
  const pedidos = pedidosDe(l);
  return {
    stream_id: l.id,
    iss: EMISSOR,
    aud: l.clienteId,
    delivery: { method: ENTREGA_PUSH, endpoint_url: l.endpointUrl },
    events_supported: [...EVENTOS_SUPORTADOS],
    events_requested: pedidos,
    events_delivered: eventosEntregues(pedidos),
    ...(l.descricao ? { description: l.descricao } : {}),
  };
}

export async function canalDoCliente(clienteId: string): Promise<Linha | null> {
  return prisma.ssfCanal.findUnique({ where: { clienteId } });
}

/** O canal, para o painel: tabela ainda não migrada é "sem canal", não erro de tela. */
export async function canalParaOPainel(clienteId: string): Promise<Linha | null> {
  try {
    return await canalDoCliente(clienteId);
  } catch (e) {
    const codigo = (e as { code?: unknown })?.code;
    if (codigo === "P2021" || codigo === "P2022") return null;
    throw e;
  }
}

/** Integração removida do painel leva o canal junto: sem ela não há quem receba. */
export async function apagarCanalDoCliente(clienteId: string): Promise<void> {
  try {
    await prisma.ssfCanal.deleteMany({ where: { clienteId } });
  } catch (e) {
    const codigo = (e as { code?: unknown })?.code;
    if (codigo !== "P2021" && codigo !== "P2022") throw e;
  }
}

/** Cria o canal da integração. Devolve `null` se ela já tem um (o receptor recebe 409). */
export async function criarCanal(clienteId: string, dados: EntradaDoCanal): Promise<Linha | null> {
  try {
    return await prisma.ssfCanal.create({
      data: {
        id: randomUUID().replace(/-/g, ""),
        clienteId,
        endpointUrl: dados.endpointUrl,
        autorizacaoEnc: dados.autorizacao ? cifrar(dados.autorizacao) : null,
        eventosPedidos: JSON.stringify(dados.eventosPedidos),
        descricao: dados.descricao,
      },
    });
  } catch (e) {
    if ((e as { code?: unknown })?.code === "P2002") return null;
    throw e;
  }
}

export async function atualizarCanal(id: string, dados: Partial<EntradaDoCanal>): Promise<Linha> {
  return prisma.ssfCanal.update({
    where: { id },
    data: {
      ...(dados.endpointUrl !== undefined ? { endpointUrl: dados.endpointUrl } : {}),
      ...(dados.autorizacao !== undefined ? { autorizacaoEnc: dados.autorizacao ? cifrar(dados.autorizacao) : null } : {}),
      ...(dados.eventosPedidos !== undefined ? { eventosPedidos: JSON.stringify(dados.eventosPedidos) } : {}),
      ...(dados.descricao !== undefined ? { descricao: dados.descricao } : {}),
    },
  });
}

export async function mudarStatusDoCanal(id: string, status: StatusDoCanal, motivo: string | null): Promise<Linha> {
  return prisma.ssfCanal.update({ where: { id }, data: { status, motivo } });
}

export async function apagarCanal(id: string): Promise<void> {
  await prisma.ssfCanal.delete({ where: { id } });
}

/** Sujeito de um evento de conta: a pessoa, pelo e-mail, que é o que o receptor conhece. */
export function sujeitoDaConta(email: string) {
  return { format: "complex", user: { format: "email", email: email.toLowerCase() } };
}

/**
 * Monta o SET de um evento. Sem `sub` e sem `exp`, como a especificação manda;
 * o sujeito vai em `sub_id`.
 */
export function montarSet(chave: ChaveDeAssinatura, dados: { aud: string; subId: unknown; tipo: string; conteudo: Record<string, unknown> }): string {
  return jwt.sign({ jti: randomUUID(), sub_id: dados.subId, events: { [dados.tipo]: dados.conteudo } }, chave.privadaPem, {
    algorithm: "RS256",
    issuer: EMISSOR,
    audience: dados.aud,
    header: { alg: "RS256", typ: "secevent+jwt", kid: chave.kid },
  });
}

/** Empurra um SET para o canal (RFC 8935). Devolve se o receptor aceitou. */
async function empurrar(l: Linha, set: string): Promise<boolean> {
  try {
    const r = await fetch(l.endpointUrl, {
      method: "POST",
      headers: { "content-type": "application/secevent+jwt", accept: "application/json", ...(l.autorizacaoEnc ? { authorization: decifrar(l.autorizacaoEnc) } : {}) },
      body: set,
      redirect: "manual",
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (r.status >= 300) console.warn(`[ssf] ${l.clienteId} respondeu ${r.status} a um evento`);
    return r.status < 300;
  } catch (e) {
    console.warn(`[ssf] ${l.clienteId} não recebeu um evento:`, e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Evento de verificação: o receptor confere que o canal chega até ele. O
 * sujeito é o próprio canal, e o `state` volta como veio.
 */
export async function enviarVerificacao(l: Linha, state?: string): Promise<boolean> {
  const chave = await chaveDeAssinatura();
  if (!chave) return false;
  return empurrar(l, montarSet(chave, { aud: l.clienteId, subId: { format: "opaque", id: l.id }, tipo: EVENTO_VERIFICACAO, conteudo: state === undefined ? {} : { state } }));
}

export type Sinal = { tipo: string; conteudo: Record<string, unknown> };

/**
 * Qual sinal um evento da auditoria vira, se virar algum.
 *
 * Fica junto da auditoria de propósito: tudo que mexe em sessão ou credencial
 * já passa por `registrar`, então o sinal sai de um lugar só e não depende de
 * cada rota lembrar de avisar.
 */
export function sinalDoEvento(tipo: string, agora: number = Date.now()): Sinal | null {
  const quando = { event_timestamp: Math.floor(agora / 1000) };
  const credencial = (credential_type: string, change_type: string): Sinal => ({ tipo: EVENTO_CREDENCIAL_MUDOU, conteudo: { credential_type, change_type, ...quando } });
  switch (tipo) {
    case "logout":
    case "conta_removida":
      return { tipo: EVENTO_SESSAO_REVOGADA, conteudo: quando };
    case "senha_trocada":
    case "senha_redefinida":
    case "recuperacao_usada":
      return credencial("password", "update");
    case "mfa_ativado":
      return credencial("app", "create");
    case "mfa_desativado":
    case "mfa_resetado":
      return credencial("app", "delete");
    default:
      return null;
  }
}

/** Manda o sinal aos canais ligados que pediram esse tipo de evento. Nunca lança. */
export async function emitirSinal(sinal: Sinal, email: string): Promise<void> {
  try {
    const canais = (await prisma.ssfCanal.findMany({ where: { status: "enabled" } })).filter((c) => eventosEntregues(pedidosDe(c)).includes(sinal.tipo));
    if (canais.length === 0) return;
    const chave = await chaveDeAssinatura();
    if (!chave) {
      console.warn("[ssf] sem chave de assinatura: sinal não enviado");
      return;
    }
    await Promise.all(canais.map((c) => empurrar(c, montarSet(chave, { aud: c.clienteId, subId: sujeitoDaConta(email), tipo: sinal.tipo, conteudo: sinal.conteudo }))));
  } catch (e) {
    const codigo = (e as { code?: unknown })?.code;
    // Tabela ainda não migrada: ninguém abriu canal.
    if (codigo !== "P2021" && codigo !== "P2022") console.error("[ssf] sinal não enviado", e instanceof Error ? e.message : e);
  }
}
