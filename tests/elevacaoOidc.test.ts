import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { register } from "node:module";
import { describe, it } from "node:test";

// As rotas e a política são reais; apenas PostgreSQL e o armazenamento de
// cookies do Next são substituídos por memória neste processo de teste.
const store = new Map<string, string>();
const app = {
  id: "airtable", host: "airtable.avilaops.com", nome: "Airtable", tipo: "app",
  login: true, papelExigido: "ADMIN", restrito: true, exigeSegundoFator: true,
  dicaDominioGoogle: null, deepLink: null, repositorio: null, servidor: null,
  publicacao: null, situacao: "no_ar", observacao: null,
};
const fixture = {
  store,
  confirmado: false,
  codigosEmitidos: 0,
  eventos: [] as { tipo: string; email: string; detalhe: string }[],
  prisma: {
    clienteOidc: { findUnique: async ({ where }: { where: { id: string } }) => where.id === "airtable-avila" ? {
      id: "airtable-avila", appId: "airtable", nome: "Airtable", ativo: true,
      redirectUris: "https://airtable.avilaops.com/avila/api/sso/callback",
      segredoHash: "unused", acessoMeta: false, ssf: false,
    } : null },
    aplicacao: { findUnique: async ({ where }: { where: { id: string } }) => where.id === "airtable" ? app : null },
    segundoFator: { findUnique: async () => fixture.confirmado ? { confirmadoEm: new Date() } : null },
    codigoOAuth: { create: async () => { fixture.codigosEmitidos++; return { id: "codigo-teste" }; } },
    evento: { create: async ({ data }: { data: { tipo: string; email: string; detalhe: string } }) => { fixture.eventos.push(data); return { id: "evento-teste" }; } },
  },
};
Object.assign(globalThis, { __elevacaoOidcFixture: fixture });
const data = (source: string) => "data:text/javascript," + encodeURIComponent(source);
register(data(`
  const prisma = ${JSON.stringify(data("export const prisma = globalThis.__elevacaoOidcFixture.prisma;"))};
  const headers = ${JSON.stringify(data("export const cookies = async () => ({ get: name => { const value=globalThis.__elevacaoOidcFixture.store.get(name); return value ? {value} : undefined; }, set: (name,value) => globalThis.__elevacaoOidcFixture.store.set(name,value), delete: name => globalThis.__elevacaoOidcFixture.store.delete(name) }); export const headers=async()=>new Map();"))};
  export function resolve(specifier, context, next) {
    if (specifier === '@/lib/prisma' || specifier.endsWith('/src/lib/prisma.ts')) return {url:prisma,shortCircuit:true};
    if (specifier === 'next/headers') return {url:headers,shortCircuit:true};
    if (specifier === 'next/server' || specifier === 'next/navigation') return next(specifier+'.js',context);
    return next(specifier,context);
  }
`), import.meta.url);

process.env.SSO_JWT_SECRET = randomBytes(32).toString("hex");
process.env.AUTH_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.MFA_EQUIPE = "opcional";
process.env.SSO_BASE_URL = "https://auth.avilaops.com";

const { NextRequest } = await import("next/server.js");
const { assinarSessao, verificarSessao } = await import("@/lib/sessao");
const { verificarDesafio } = await import("@/lib/desafio");
const { GET: autorizar } = await import("@/app/oauth/authorize/route");
const { GET: elevar } = await import("@/app/api/auth/mfa/elevar/route");
const retorno = "/oauth/authorize?client_id=airtable-avila&response_type=code&redirect_uri=https%3A%2F%2Fairtable.avilaops.com%2Favila%2Fapi%2Fsso%2Fcallback&state=estado-original&nonce=nonce-original&code_challenge=desafio-original&code_challenge_method=S256";

describe("elevação de segundo fator em OIDC", () => {
  it("suspende somente a conta autorizada e volta a exigir MFA quando a janela expira", async () => {
    const anterior = process.env.MFA_SUSPENSAO_TEMPORARIA;
    const agora = Date.now();
    const configuracao = { email: "qa@example.com", inicio: new Date(agora - 1000).toISOString(), fim: new Date(agora + 60_000).toISOString(), motivo: "Exceção operacional de teste" };
    try {
      fixture.confirmado = true;
      fixture.codigosEmitidos = 0;
      fixture.eventos = [];
      process.env.MFA_SUSPENSAO_TEMPORARIA = JSON.stringify(configuracao);
      const preparar = (email: string) => {
        store.clear();
        store.set("avila_sso", assinarSessao({ sub: "qa", email, nome: "QA", foto: null, papel: "ADMIN", mfa: false }));
      };
      preparar(configuracao.email);
      const liberada = await autorizar(new NextRequest("https://auth.avilaops.com" + retorno));
      const local = new URL(liberada.headers.get("location")!);
      assert.equal(local.hostname, "airtable.avilaops.com");
      assert.ok(local.searchParams.get("code"));
      assert.equal(local.searchParams.get("state"), "estado-original");
      assert.equal(fixture.codigosEmitidos, 1);
      assert.equal(verificarSessao(store.get("avila_sso")!)?.mfa, false);
      assert.equal(fixture.confirmado, true, "a suspensão não remove o autenticador");
      assert.ok(fixture.eventos.some(evento => evento.tipo === "mfa_suspenso_temporariamente" && evento.email === configuracao.email));

      preparar("outra@example.com");
      const outra = await autorizar(new NextRequest("https://auth.avilaops.com" + retorno));
      assert.equal(new URL(outra.headers.get("location")!).pathname, "/api/auth/mfa/elevar");
      assert.equal(fixture.codigosEmitidos, 1);

      process.env.MFA_SUSPENSAO_TEMPORARIA = JSON.stringify({ ...configuracao, inicio: new Date(agora - 60_000).toISOString(), fim: new Date(agora - 1000).toISOString() });
      preparar(configuracao.email);
      const expirada = await autorizar(new NextRequest("https://auth.avilaops.com" + retorno));
      assert.equal(new URL(expirada.headers.get("location")!).pathname, "/api/auth/mfa/elevar");
      assert.equal(fixture.codigosEmitidos, 1);
    } finally {
      if (anterior === undefined) delete process.env.MFA_SUSPENSAO_TEMPORARIA;
      else process.env.MFA_SUSPENSAO_TEMPORARIA = anterior;
    }
  });

  for (const confirmado of [false, true]) {
    it(`interrompe o ciclo e preserva a autorização ao ${confirmado ? "verificar" : "cadastrar"} o fator`, async () => {
      fixture.confirmado = confirmado;
      store.clear();
      store.set("avila_sso", assinarSessao({ sub: "qa", email: "qa@example.com", nome: "QA", foto: null, papel: "ADMIN", mfa: false }));
      const resposta = await autorizar(new NextRequest("https://auth.avilaops.com" + retorno));
      const proxima = resposta.headers.get("location")!;
      assert.equal(new URL(proxima).pathname, "/api/auth/mfa/elevar");
      const elevacao = await elevar(new NextRequest(proxima));
      assert.equal(elevacao.headers.get("location"), "https://auth.avilaops.com" + (confirmado ? "/mfa" : "/mfa/cadastrar"));
      const desafio = verificarDesafio(store.get("avila_sso_desafio")!);
      assert.equal(desafio?.appId, "airtable");
      assert.equal(desafio?.destino, retorno);
    });
  }

  it("não aceita retorno para um host externo ao elevar um app", async () => {
    fixture.confirmado = false;
    const resposta = await elevar(new NextRequest("https://auth.avilaops.com/api/auth/mfa/elevar?app=airtable&returnTo=https%3A%2F%2Fevil.example%2F"));
    assert.equal(resposta.headers.get("location"), "https://auth.avilaops.com/mfa/cadastrar");
    assert.equal(verificarDesafio(store.get("avila_sso_desafio")!)?.destino, "https://airtable.avilaops.com/");
  });
});
