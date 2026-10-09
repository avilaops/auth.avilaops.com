import assert from "node:assert/strict";
import { test } from "node:test";
import { FalhaDeEnvio, enviarPeloN8n, lerReleDeEmail } from "@/lib/email";

const RELE = { url: "https://n8n.exemplo.test/webhook/auth-enviar-email", token: "token-de-teste" };
const EMAIL = { para: " ana@empresa.test ", assunto: "Seu acesso:\r\nTMS", texto: "Olá", html: "<p>Olá</p>" };

function n8n(status: number, corpo: unknown) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const buscar = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { chamadas, buscar };
}

test("sem token não há envio pelo n8n", () => {
  assert.equal(lerReleDeEmail({}), null);
  assert.equal(lerReleDeEmail({ N8N_CAIXA_WEBHOOK_URL: "https://n8n.exemplo.test/webhook/auth-criar-caixa" }), null);
});

test("o endereço é o vizinho do criar-caixa, com o mesmo token", () => {
  assert.deepEqual(lerReleDeEmail({ N8N_CAIXA_WEBHOOK_URL: "https://n8n.exemplo.test/webhook/auth-criar-caixa", N8N_CAIXA_WEBHOOK_TOKEN: " t " }), {
    url: "https://n8n.exemplo.test/webhook/auth-enviar-email",
    token: "t",
  });
});

test("endereço explícito vale mais; sem https o token não sai daqui", () => {
  const base = { N8N_CAIXA_WEBHOOK_URL: "https://n8n.exemplo.test/webhook/auth-criar-caixa", N8N_CAIXA_WEBHOOK_TOKEN: "t" };
  assert.equal(lerReleDeEmail({ ...base, N8N_EMAIL_WEBHOOK_URL: "https://outro.exemplo.test/w/email" })?.url, "https://outro.exemplo.test/w/email");
  assert.equal(lerReleDeEmail({ ...base, N8N_EMAIL_WEBHOOK_URL: "http://outro.exemplo.test/w/email" }), null);
  assert.equal(lerReleDeEmail({ N8N_CAIXA_WEBHOOK_URL: "nao-e-endereco", N8N_CAIXA_WEBHOOK_TOKEN: "t" }), null);
});

test("entrega a mensagem com o token no cabeçalho e o assunto em uma linha", async () => {
  const { chamadas, buscar } = n8n(200, { ok: true, messageId: "<abc@mail>" });
  assert.deepEqual(await enviarPeloN8n(RELE, EMAIL, buscar), { messageId: "<abc@mail>" });

  assert.equal(chamadas[0].url, RELE.url);
  assert.equal(new Headers(chamadas[0].init.headers).get("x-avila-webhook-token"), "token-de-teste");
  const corpo = JSON.parse(String(chamadas[0].init.body));
  assert.equal(corpo.para, "ana@empresa.test");
  assert.ok(!/[\r\n]/.test(corpo.assunto) && corpo.assunto.includes("TMS"));
  assert.equal(corpo.html, "<p>Olá</p>");
});

test("recusa do n8n vira FalhaDeEnvio com o motivo", async () => {
  await assert.rejects(enviarPeloN8n(RELE, EMAIL, n8n(200, { ok: false, erro: "550 caixa inexistente" }).buscar), (e) => e instanceof FalhaDeEnvio && /550/.test(e.message));
  await assert.rejects(enviarPeloN8n(RELE, EMAIL, n8n(403, {}).buscar), (e) => e instanceof FalhaDeEnvio && /403/.test(e.message));
  const semRede = (async () => {
    throw new Error("sem rede");
  }) as typeof fetch;
  await assert.rejects(enviarPeloN8n(RELE, EMAIL, semRede), FalhaDeEnvio);
});
