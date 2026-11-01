import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { register } from "node:module";
import { beforeEach, describe, it } from "node:test";

// Rotas, tokens, validação de destino, permissão e MFA reais. Somente os
// adaptadores de armazenamento, entrega de e-mail e cookies usam memória.
type Token = { tokenHash: string; email: string; appId: string | null; destino: string | null; expiraEm: Date; usadoEm?: Date };
const fixture = {
  existente: true, liberado: true, fatorAtivo: false,
  emails: [] as { texto: string }[], cookies: new Map<string, string>(), tokens: new Map<string, Token>(),
  conta: { id: "conta-teste", email: "pessoa@example.test", nome: "Pessoa Teste", role: "CLIENT" },
  app: { id: "erp", host: "erp.avilaops.com", nome: "ERP", tipo: "app", login: true, papelExigido: null, restrito: false, exigeSegundoFator: false, situacao: "no_ar" },
  prisma: {
    aplicacao: { findUnique: async ({ where }: { where: { id: string } }) => where.id === "erp" ? fixture.app : null },
    clienteOidc: { findUnique: async ({ where }: { where: { id: string } }) => where.id === "erp-client" ? { id: "erp-client", appId: "erp", nome: "ERP", ativo: true, redirectUris: "https://erp.avilaops.com/api/auth/callback", segredoHash: "unused", acessoMeta: false, ssf: false } : null },
    permissao: { findUnique: async () => fixture.liberado ? { id: "permissao" } : null },
    segundoFator: { findUnique: async () => fixture.fatorAtivo ? { confirmadoEm: new Date() } : null },
    tokenRecuperacao: {
      create: async ({ data }: { data: Token }) => { fixture.tokens.set(data.tokenHash, data); return data; },
      findUnique: async ({ where }: { where: { tokenHash: string } }) => fixture.tokens.get(where.tokenHash) ?? null,
      updateMany: async ({ where, data }: { where: { tokenHash: string; expiraEm: { gt: Date } }; data: { usadoEm: Date } }) => {
        const token = fixture.tokens.get(where.tokenHash);
        if (!token || token.usadoEm || token.expiraEm <= where.expiraEm.gt) return { count: 0 };
        token.usadoEm = data.usadoEm;
        return { count: 1 };
      },
    },
  },
};
Object.assign(globalThis, { __retornoCadastro: fixture });
const data = (source: string) => "data:text/javascript," + encodeURIComponent(source);
const substitutos = {
  "@/lib/prisma": "export const prisma=globalThis.__retornoCadastro.prisma;",
  "@/lib/contas": "const f=globalThis.__retornoCadastro; export const buscarContaPorEmail=async()=>f.existente?f.conta:null; export const criarConta=async()=>{f.existente=true;return {conta:f.conta}}; export const definirSenha=async()=>{}; export const papelDaRole=()=> 'CLIENTE';",
  "@/lib/email": "export const emailConfigurado=()=>true; export const enviarEmail=async(msg)=>globalThis.__retornoCadastro.emails.push(msg);",
  "@/lib/rateLimit": "export const limitar=async()=>true;",
  "@/lib/eventos": "export const registrar=async()=>{};",
  "next/headers": "const f=globalThis.__retornoCadastro; export const cookies=async()=>({get:name=>{const value=f.cookies.get(name);return value?{value}:undefined},set:(name,value)=>f.cookies.set(name,value),delete:name=>f.cookies.delete(name)});export const headers=async()=>new Map();",
};
register(data(`
  const overrides=${JSON.stringify(Object.fromEntries(Object.entries(substitutos).map(([key, value]) => [key, data(value)])))};
  export function resolve(specifier,context,next){
    if(overrides[specifier])return {url:overrides[specifier],shortCircuit:true};
    if(specifier === 'next/navigation')return next(specifier+'.js',context);
    return next(specifier,context);
  }
`), import.meta.url);
process.env.SSO_JWT_SECRET = randomBytes(32).toString("hex");
process.env.AUTH_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.SSO_BASE_URL = "https://auth.avilaops.com";
process.env.MFA_HABILITADO = "true";
delete process.env.MFA_SUSPENSAO_TEMPORARIA;

const { NextRequest } = await import("next/server.js");
const { origemDoCadastro } = await import("@/lib/origemDoCadastro");
const { POST: criar } = await import("@/app/api/auth/criar/route");
const { POST: recuperar } = await import("@/app/api/auth/recuperar/route");
const { POST: confirmar } = await import("@/app/api/auth/criar/confirmar/route");
const { lerTokenDeCadastro } = await import("@/lib/cadastroProprio");
const { verificarDesafio } = await import("@/lib/desafio");
const oidc = "/oauth/authorize?" + new URLSearchParams({ client_id: "erp-client", redirect_uri: "https://erp.avilaops.com/api/auth/callback", response_type: "code", state: "estado-antigo", nonce: "nonce-antigo", code_challenge: "desafio-antigo", code_challenge_method: "S256" });
const req = (path: string, body: object) => new NextRequest("https://auth.avilaops.com" + path, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
async function pedir(app: string | null = null, returnTo: string | null = oidc) {
  const res = await criar(req("/api/auth/criar", { nome: "Pessoa Teste", email: fixture.conta.email, app, returnTo }));
  assert.equal(res.status, 200);
  return res.json();
}
function tokenEnviado() {
  const url = fixture.emails.at(-1)!.texto.match(/https:\/\/auth\.avilaops\.com\/\S+/)![0];
  return new URL(url).pathname.split("/").at(-1)!;
}
beforeEach(() => {
  fixture.existente = true; fixture.liberado = true; fixture.fatorAtivo = false;
  fixture.app.restrito = false; fixture.app.exigeSegundoFator = false;
  fixture.emails = []; fixture.tokens.clear(); fixture.cookies.clear();
});

describe("origem de cadastro e recuperação", () => {
  it("recupera conta existente no ERP mesmo sem cookies do fluxo original", async () => {
    await pedir();
    const token = tokenEnviado();
    assert.deepEqual([...fixture.tokens.values()].map(({ appId, destino }) => ({ appId, destino })), [{ appId: "erp", destino: "https://erp.avilaops.com/" }]);
    const res = await recuperar(req("/api/auth/recuperar", { token, nova: "senha-de-teste" }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).destino, "https://erp.avilaops.com/");
    assert.equal((await recuperar(req("/api/auth/recuperar", { token, nova: "senha-de-teste" }))).status, 400);
  });

  it("cadastro novo e recuperação têm a mesma resposta pública e produto de origem", async () => {
    const existente = await pedir();
    fixture.existente = false;
    const novo = await pedir();
    assert.deepEqual(novo, existente);
    const token = tokenEnviado();
    const pedido = lerTokenDeCadastro(token)!;
    assert.equal(pedido.app, "erp");
    assert.equal(pedido.returnTo, "https://erp.avilaops.com/");
    assert.doesNotMatch(JSON.stringify(pedido), /estado-antigo|nonce-antigo|desafio-antigo/);
    const res = await confirmar(req("/api/auth/criar/confirmar", { token, nova: "senha-de-teste" }));
    assert.equal(res.status, 200);
    const destino = new URL((await res.json()).destino, "https://auth.avilaops.com");
    assert.equal(destino.pathname, "/login");
    assert.equal(destino.searchParams.get("app"), "erp");
    assert.equal(destino.searchParams.get("returnTo"), "https://erp.avilaops.com/");
    const repetido = await confirmar(req("/api/auth/criar/confirmar", { token, nova: "senha-de-teste" }));
    assert.equal(repetido.status, 409);
    assert.equal((await repetido.json()).entrarEm, destino.pathname + destino.search);
  });

  it("mantém caminho válido de produto explícito e o destino padrão do portal", async () => {
    assert.deepEqual(await origemDoCadastro("erp", "https://erp.avilaops.com/vendas?pagina=2"), { app: "erp", returnTo: "https://erp.avilaops.com/vendas?pagina=2" });
    await pedir(null, null);
    const res = await recuperar(req("/api/auth/recuperar", { token: tokenEnviado(), nova: "senha-de-teste" }));
    assert.equal((await res.json()).destino, "/conta");
  });

  it("recusa destinos externos, credenciais, callbacks, laços e caminhos malformados", async () => {
    for (const destino of ["https://evil.test", "//evil.test", "/\\evil.test", "https://user@erp.avilaops.com/vendas", "http://erp.avilaops.com/", "https://erp.avilaops.com/api/auth/callback?code=x", "https://erp.avilaops.com/entrar", "https://erp.avilaops.com/%255c%255cevil", "https://erp.avilaops.com/%2f%2fevil", "https://erp.avilaops.com/vendas?state=antigo", "x".repeat(2001)]) {
      assert.equal((await origemDoCadastro("erp", destino)).returnTo, "https://erp.avilaops.com/", destino);
    }
    for (const destino of ["/login?returnTo=/login", "https://evil.test", oidc.replace("erp-client", "inexistente"), oidc.replace("erp.avilaops.com", "evil.test"), oidc + "&client_id=outro", oidc + "#fragmento"]) {
      assert.deepEqual(await origemDoCadastro(null, destino), { app: null, returnTo: null }, destino);
    }
  });

  it("revalida permissão revogada depois do envio do link", async () => {
    fixture.app.restrito = true;
    await pedir();
    fixture.liberado = false;
    const res = await recuperar(req("/api/auth/recuperar", { token: tokenEnviado(), nova: "senha-de-teste" }));
    assert.equal((await res.json()).destino, "/conta");
  });

  it("não abre sessão sem o segundo fator exigido pelo produto", async () => {
    fixture.app.exigeSegundoFator = true;
    await pedir();
    const res = await recuperar(req("/api/auth/recuperar", { token: tokenEnviado(), nova: "senha-de-teste" }));
    assert.equal((await res.json()).destino, "/mfa/cadastrar");
    const desafio = [...fixture.cookies.values()].map(verificarDesafio).find(Boolean);
    assert.equal(desafio?.appId, "erp");
    assert.equal(desafio?.destino, "https://erp.avilaops.com/");
    assert.equal(fixture.cookies.has("avila_sso"), false);
  });

  it("recusa recuperação vencida sem criar sessão", async () => {
    await pedir();
    for (const token of fixture.tokens.values()) token.expiraEm = new Date(0);
    const res = await recuperar(req("/api/auth/recuperar", { token: tokenEnviado(), nova: "senha-de-teste" }));
    assert.equal(res.status, 400);
    assert.equal(fixture.cookies.size, 0);
  });
});
