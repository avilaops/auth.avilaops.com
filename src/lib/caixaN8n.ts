/**
 * Provisionamento de caixa de e-mail pelo n8n.
 *
 * O auth não fala com a API do mail direto: ela escuta no loopback do host, e
 * um fetch do container sairia para a internet e voltaria (hairpin pelo
 * Cloudflare), que é lento e falha. O pedido vai ao fluxo "Auth — Criar caixa
 * de e-mail" no n8n, que chama `POST /v1/mailboxes` do mail.avilaops.com com a
 * credencial de provisionamento e responde na mesma requisição.
 *
 * A senha viaja no corpo do pedido (HTTPS, header de autenticação) e não fica
 * salva em lugar nenhum: o mail grava só o hash e o n8n não persiste o corpo.
 */

export type PedidoCaixa = {
  domain: string;
  username: string;
  password: string;
  displayName?: string;
  /** Conta do SSO que passa a ser dona da caixa (abre o webmail sem senha). */
  ownerEmail?: string;
  /** Endereço de contato que recebe o aviso de caixa pronta (sem a senha). */
  notifyTo?: string;
  /** Quem pediu, para o rastro do n8n. */
  autor: string;
};

export type RespostaCaixa =
  | { ok: true; address: string; quotaGb?: number; webmail?: string }
  | { ok: false; erro: string };

const LOCAL_PART = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function usuarioDeCaixaValido(username: string): boolean {
  return LOCAL_PART.test(username) && !username.includes("..");
}

export function automacaoDeCaixaConfigurada(): boolean {
  return Boolean(process.env.N8N_CAIXA_WEBHOOK_URL && process.env.N8N_CAIXA_WEBHOOK_TOKEN);
}

export async function provisionarCaixa(pedido: PedidoCaixa): Promise<RespostaCaixa> {
  const url = process.env.N8N_CAIXA_WEBHOOK_URL;
  const token = process.env.N8N_CAIXA_WEBHOOK_TOKEN;
  if (!url || !token) {
    return { ok: false, erro: "Automação de caixa não configurada (N8N_CAIXA_WEBHOOK_URL / N8N_CAIXA_WEBHOOK_TOKEN)." };
  }

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-avila-webhook-token": token },
      body: JSON.stringify(pedido),
      // O mail cria a caixa, as pastas e a mensagem de boas-vindas antes de
      // responder; o n8n repassa. 40 s cobre o pior caso com folga.
      signal: AbortSignal.timeout(40_000),
      cache: "no-store",
    });
    const texto = await r.text();
    let dados: { ok?: unknown; address?: unknown; quotaGb?: unknown; webmail?: unknown; erro?: unknown } | null = null;
    try {
      dados = JSON.parse(texto);
    } catch {
      dados = null;
    }

    if (dados && typeof dados.ok === "boolean") {
      if (dados.ok) {
        return {
          ok: true,
          address: String(dados.address ?? `${pedido.username}@${pedido.domain}`).toLowerCase(),
          quotaGb: typeof dados.quotaGb === "number" ? dados.quotaGb : undefined,
          webmail: typeof dados.webmail === "string" ? dados.webmail : undefined,
        };
      }
      return { ok: false, erro: String(dados.erro ?? "o n8n não informou o motivo") };
    }
    return { ok: false, erro: `n8n respondeu HTTP ${r.status}${texto ? `: ${texto.slice(0, 200)}` : ""}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, erro: /abort|timeout/i.test(msg) ? "o n8n não respondeu em 40 s" : msg };
  }
}
