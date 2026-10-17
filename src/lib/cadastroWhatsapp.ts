/**
 * Cadastro incorporado do WhatsApp (Embedded Signup v4 da Meta): o que vem da
 * janela da Meta e o que vai para o servidor.
 *
 * A janela fala de dois jeitos. O SDK devolve, no retorno do `FB.login`, um
 * código que vale 30 segundos; e a página da Meta manda, por `postMessage`, a
 * conta do WhatsApp Business (WABA) e o número que a pessoa escolheu. Os dois
 * chegam em qualquer ordem, e o servidor precisa dos dois.
 *
 * Este arquivo roda no navegador: não importa nada do servidor.
 */

export type EventoCadastro =
  | { estado: "concluido"; wabaId: string; phoneNumberId: string | null; businessId: string | null }
  | { estado: "cancelado"; etapa: string | null }
  | { estado: "erro"; mensagem: string };

/** Identificador da Graph: só dígitos. Qualquer outra coisa é recusada. */
export function idGraph(v: unknown): string | null {
  return typeof v === "string" && /^\d{5,25}$/.test(v) ? v : null;
}

/** A mensagem só vale vinda de uma página da Meta em `facebook.com`. */
export function origemDaMeta(origem: string): boolean {
  try {
    const u = new URL(origem);
    return u.protocol === "https:" && (u.hostname === "facebook.com" || u.hostname.endsWith(".facebook.com"));
  } catch {
    return false;
  }
}

/**
 * Lê a mensagem `WA_EMBEDDED_SIGNUP`. Devolve `null` para qualquer outra
 * mensagem, que a página ignora.
 *
 * Todo evento que começa com `FINISH` é conclusão (número novo, só a conta,
 * app do WhatsApp Business…). A Meta documenta o erro informado pela pessoa
 * tanto como `ERROR` quanto como `CANCEL` com `error_message`: os dois viram erro.
 */
export function lerEventoCadastro(bruto: unknown): EventoCadastro | null {
  let dados: unknown = bruto;
  if (typeof bruto === "string") {
    try {
      dados = JSON.parse(bruto);
    } catch {
      return null;
    }
  }
  if (typeof dados !== "object" || dados === null) return null;
  const m = dados as { type?: unknown; event?: unknown; data?: Record<string, unknown> };
  if (m.type !== "WA_EMBEDDED_SIGNUP" || typeof m.event !== "string") return null;
  const d = m.data ?? {};

  if (typeof d.error_message === "string" && d.error_message) return { estado: "erro", mensagem: d.error_message };
  if (m.event.startsWith("FINISH")) {
    const wabaId = idGraph(d.waba_id) ?? (Array.isArray(d.waba_ids) ? idGraph(d.waba_ids[0]) : null);
    if (!wabaId) return { estado: "erro", mensagem: "A Meta não informou a conta do WhatsApp Business." };
    return { estado: "concluido", wabaId, phoneNumberId: idGraph(d.phone_number_id), businessId: idGraph(d.business_id) };
  }
  if (m.event === "CANCEL") return { estado: "cancelado", etapa: typeof d.current_step === "string" ? d.current_step : null };
  if (m.event === "ERROR") return { estado: "erro", mensagem: "A Meta informou um erro no cadastro." };
  return null;
}

/** O que a tela manda para `POST /api/meta/whatsapp`. */
export type PedidoCadastro = { code: string; wabaId: string; phoneNumberId: string | null; businessId: string | null };

/** Confere o corpo recebido pelo servidor. */
export function lerPedidoCadastro(corpo: unknown): PedidoCadastro | null {
  if (typeof corpo !== "object" || corpo === null) return null;
  const c = corpo as Record<string, unknown>;
  if (typeof c.code !== "string" || c.code.length < 10 || c.code.length > 2000) return null;
  const wabaId = idGraph(c.wabaId);
  if (!wabaId) return null;
  if (c.phoneNumberId != null && !idGraph(c.phoneNumberId)) return null;
  if (c.businessId != null && !idGraph(c.businessId)) return null;
  return { code: c.code, wabaId, phoneNumberId: idGraph(c.phoneNumberId), businessId: idGraph(c.businessId) };
}
