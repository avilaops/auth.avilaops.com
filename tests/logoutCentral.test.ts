import assert from "node:assert/strict";
import { register } from "node:module";
import { beforeEach, describe, it } from "node:test";

const identidade = { sub: "conta-teste", email: "pessoa@example.test", nome: "Pessoa", papel: "CLIENTE", foto: null };
const retorno = "https://produto.example.test/saiu";
const fixture = {
  sessao: { ...identidade } as typeof identidade | null,
  efeitos: [] as string[], tarefas: [] as (() => unknown)[], clienteAtivo: true,
  destinoAtivo: true,
  erroBanco: null as Error | null, prisma: {} as object,
};
fixture.prisma = {
  clienteOidc: { findUnique: async ({ where }: { where: { id: string } }) => {
    if (fixture.erroBanco) throw fixture.erroBanco;
    return where.id === "produto" ? { id: "produto", appId: "produto", nome: "Produto", ativo: fixture.clienteAtivo, redirectUris: "", postLogoutRedirectUris: retorno, segredoHash: "nao-utilizado", acessoMeta: false, ssf: false } : null;
  } },
  redirectUri: { findMany: async ({ where }: { where: { clienteId: string; tipo: string } }) =>
    fixture.destinoAtivo && where.clienteId === "produto" && where.tipo === "post_logout" ? [{ uri: retorno }] : [],
  },
  aplicacao: { findUnique: async ({ where }: { where: { id: string } }) => where.id === "produto" ? {
    id: "produto", host: "produto.example.test", nome: "Produto", tipo: "app", login: true,
    situacao: "no_ar", papelExigido: null, restrito: true, exigeSegundoFator: false,
  } : null },
};
Object.assign(globalThis, { __logoutCentral: fixture });
const dataUrl = (source: string) => "data:text/javascript," + encodeURIComponent(source);
const f = "const f = globalThis.__logoutCentral;";
const substitutos = {
  "@/lib/prisma": f + "export const prisma = f.prisma;",
  "@/lib/sessao": f + `
    export const lerSessao = async () => f.sessao;
    export const limparCookieSessao = async () => { f.efeitos.push('cookie'); f.sessao = null; };
  `,
  "@/lib/refreshOAuth": f + "export const revogarRefreshDaConta = async sub => f.efeitos.push('refresh:' + sub);",
  "@/lib/avisoDeLogout": f + "export const avisarLogout = async sub => f.efeitos.push('aviso:' + sub);",
  "@/lib/eventos": f + "export const registrar = async evento => f.efeitos.push(evento.tipo + ':' + evento.email);",
  "next/server": f + `
    export { NextRequest, NextResponse } from ${JSON.stringify(import.meta.resolve("next/server.js"))};
    export const after = tarefa => f.tarefas.push(tarefa);
  `,
};
register(dataUrl(`
  const substitutos = ${JSON.stringify(Object.fromEntries(Object.entries(substitutos).map(([key, value]) => [key, dataUrl(value)])))};
  export function resolve(specifier, context, next) {
    if (substitutos[specifier]) return { url: substitutos[specifier], shortCircuit: true };
    return next(specifier, context);
  }
`), import.meta.url);
process.env.SSO_BASE_URL = "https://auth.avilaops.com";
const { NextRequest } = await import("next/server.js");
const { GET, POST } = await import("@/app/api/auth/logout/route");
const { origemLocalDoLogout } = await import("@/lib/pedidoLogout");
const pedido = new URLSearchParams({ client_id: "produto", post_logout_redirect_uri: retorno });
const req = (method: string, busca = "", origin: string | null = null, body?: string) => new NextRequest(
  "https://auth.avilaops.com/api/auth/logout" + (busca ? "?" + busca : ""), {
    method, headers: { ...(origin === null ? {} : { origin }), ...(body === undefined ? {} : { "content-type": "application/x-www-form-urlencoded" }) }, body,
  },
);
function semEfeitos() {
  assert.deepEqual(fixture.efeitos, []);
  assert.deepEqual(fixture.tarefas, []);
  assert.deepEqual(fixture.sessao, identidade);
}
beforeEach(() => {
  fixture.sessao = { ...identidade }; fixture.efeitos = []; fixture.tarefas = [];
  fixture.clienteAtivo = true; fixture.destinoAtivo = true; fixture.erroBanco = null;
});

describe("confirmação antes do logout central", () => {
  it("GET nunca encerra a sessão, inclusive com cliente e destino válidos", async () => {
    for (const busca of ["", pedido.toString()]) {
      const resposta = await GET(req("GET", busca));
      assert.equal(resposta.status, 303);
      assert.equal(new URL(resposta.headers.get("location")!).pathname, "/sair");
      assert.match(resposta.headers.get("cache-control")!, /no-store/);
      semEfeitos();
    }
  });
  for (const origin of [null, "null", "https://site-externo.test", "https://crm.avilaops.com", "https://auth.avilaops.com.evil.test"]) {
    it(`POST de origem ${JSON.stringify(origin)} pede confirmação sem encerrar sessão`, async () => {
      const resposta = await POST(req("POST", pedido.toString(), origin));
      const destino = new URL(resposta.headers.get("location")!);
      assert.equal(resposta.status, 303);
      assert.equal(destino.origin, "https://auth.avilaops.com");
      assert.equal(destino.pathname, "/sair");
      assert.equal(destino.searchParams.get("post_logout_redirect_uri"), retorno);
      semEfeitos();
    });
  }
  it("formulário legado de consumidor preserva app e returnTo na confirmação", async () => {
    const resposta = await POST(req("POST", "app=produto&returnTo=" + encodeURIComponent(retorno), "https://produto.example.test"));
    const destino = new URL(resposta.headers.get("location")!);
    assert.equal(destino.pathname, "/sair");
    assert.equal(destino.searchParams.get("app"), "produto");
    assert.equal(destino.searchParams.get("returnTo"), retorno);
    semEfeitos();
  });
  for (const origin of ["https://auth.avilaops.com", "https://conta.avilaops.com"]) {
    it(`POST do próprio serviço (${origin}) revoga, audita e agenda aviso`, async () => {
      const resposta = await POST(req("POST", pedido.toString(), origin));
      assert.equal(resposta.status, 303);
      assert.equal(resposta.headers.get("location"), retorno);
      assert.equal(fixture.sessao, null);
      assert.deepEqual(fixture.efeitos, ["cookie", "refresh:conta-teste", "logout:pessoa@example.test"]);
      assert.equal(fixture.tarefas.length, 1);
      await fixture.tarefas[0]();
      assert.equal(fixture.efeitos.at(-1), "aviso:conta-teste");
    });
  }
  it("destino inválido, cliente desconhecido ou inativo não produzem logout", async () => {
    for (const busca of [
      "client_id=produto&post_logout_redirect_uri=https://invasor.test",
      "client_id=desconhecido&post_logout_redirect_uri=" + encodeURIComponent(retorno),
      "post_logout_redirect_uri=" + encodeURIComponent(retorno),
    ]) {
      assert.equal((await POST(req("POST", busca, "https://auth.avilaops.com"))).status, 400);
      semEfeitos();
    }
    fixture.clienteAtivo = false;
    assert.equal((await POST(req("POST", pedido.toString(), "https://auth.avilaops.com"))).status, 400);
    semEfeitos();
  });
  it("preserva state somente no retorno OIDC já validado", async () => {
    const q = new URLSearchParams(pedido); q.set("state", "estado opaco & + / ç");
    const resposta = await POST(req("POST", q.toString(), "https://auth.avilaops.com"));
    const destino = new URL(resposta.headers.get("location")!);
    assert.equal(destino.origin + destino.pathname, retorno);
    assert.equal(destino.searchParams.get("state"), "estado opaco & + / ç");
  });
  it("revalida destino revogado entre navegação e confirmação", async () => {
    await GET(req("GET", pedido.toString()));
    fixture.destinoAtivo = false;
    assert.equal((await POST(req("POST", pedido.toString(), "https://auth.avilaops.com"))).status, 400);
    semEfeitos();
  });
  it("mantém retorno legado seguro e não usa returnTo sem aplicação", async () => {
    const legado = await POST(req("POST", "app=produto&returnTo=https://invasor.test", "https://auth.avilaops.com"));
    assert.equal(legado.headers.get("location"), "https://produto.example.test/");
    const semApp = await POST(req("POST", "returnTo=https://invasor.test", "https://auth.avilaops.com"));
    assert.equal(semApp.headers.get("location"), "https://auth.avilaops.com/login");
  });
  it("aceita serialização de formulário OIDC no corpo", async () => {
    const resposta = await POST(req("POST", "", "https://auth.avilaops.com", pedido.toString()));
    assert.equal(resposta.headers.get("location"), retorno);
  });
  it("recusa parâmetros duplicados, ambíguos, hints não suportados e corpo excessivo", async () => {
    for (const busca of [pedido + "&client_id=outro", pedido + "&id_token_hint=nao-e-uma-prova", "state=" + "x".repeat(2049)]) {
      assert.equal((await POST(req("POST", busca, "https://auth.avilaops.com"))).status, 400);
      semEfeitos();
    }
    assert.equal((await POST(req("POST", pedido.toString(), "https://auth.avilaops.com", "client_id=produto"))).status, 400);
    assert.equal((await POST(req("POST", "", "https://auth.avilaops.com", "state=" + "x".repeat(9000)))).status, 400);
    semEfeitos();
  });
  it("indisponibilidade de banco é propagada antes de qualquer efeito", async () => {
    fixture.erroBanco = new Error("Banco indisponível no teste");
    await assert.rejects(POST(req("POST", pedido.toString(), "https://auth.avilaops.com")), fixture.erroBanco);
    semEfeitos();
  });
  it("repetir logout sem sessão não repete revogação nem auditoria", async () => {
    await POST(req("POST", pedido.toString(), "https://auth.avilaops.com"));
    fixture.efeitos = []; fixture.tarefas = [];
    const resposta = await POST(req("POST", pedido.toString(), "https://auth.avilaops.com"));
    assert.equal(resposta.headers.get("location"), retorno);
    assert.deepEqual(fixture.efeitos, ["cookie"]);
    assert.deepEqual(fixture.tarefas, []);
  });
  it("desenvolvimento aceita só a origem configurada, sem confiar em subdomínio ou host recebido", () => {
    process.env.SSO_BASE_URL = "http://localhost:3024";
    try {
      assert.equal(origemLocalDoLogout("http://localhost:3024"), true);
      for (const origin of [null, "null", "http://localhost:3025", "http://127.0.0.1:3024", "https://conta.avilaops.com", "https://auth.avilaops.com"]) {
        assert.equal(origemLocalDoLogout(origin), false);
      }
    } finally {
      process.env.SSO_BASE_URL = "https://auth.avilaops.com";
    }
  });
});
