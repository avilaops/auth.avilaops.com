import assert from "node:assert/strict";
import { register } from "node:module";
import { beforeEach, describe, it } from "node:test";

const atual = { sub: "conta", email: "atual@example.com", nome: "Nome atual", foto: null, papel: "CLIENTE" };
const fixture = {
  conta: { ...atual } as typeof atual | null,
  app: { id: "produto" } as { id: string } | null,
  permitido: true,
  emitidos: 0,
  revogados: [] as string[],
  identidadeEmitida: null as unknown,
  identidadeAutorizada: null as unknown,
};
Object.assign(globalThis, { __tokenAutorizacaoFixture: fixture });
const dataUrl = (source: string) => "data:text/javascript," + encodeURIComponent(source);
const f = "const f = globalThis.__tokenAutorizacaoFixture;";
const fontes = {
  "@/lib/appsDaIdentidade": "export const appsDaIdentidade = async () => [];",
  "@/lib/cadastro": f + "export const buscarApp = async () => f.app;",
  "@/lib/contas": f + "export const buscarConta = async () => f.conta;",
  "@/lib/eventos": "export const registrar = async () => {};",
  "@/lib/rateLimit": "export const limitar = async () => true;",
  "@/lib/permissoes": f + "export const podeEntrar = async (email, papel) => { f.identidadeAutorizada = {email, papel}; return f.permitido; };",
  "@/lib/refreshOAuth": f + `
    export const identidadeParaRenovar = conta => conta;
    export const emitirRefresh = async () => { f.emitidos++; return 'refresh-novo'; };
    export const gastarRefresh = async () => ({ok:true, sub:'conta', familia:'familia', escopo:'openid ssf.manage'});
    export const revogarFamilia = async familia => { f.revogados.push(familia); };
  `,
  "@/lib/oidc": f + `
    export const TTL_TOKEN_SEGUNDOS = 3600;
    export const autenticarCliente = async () => ({id:'cliente', appId:'produto', ssf:true});
    export const redirectUriValido = () => true;
    export const resgatarCodigoOAuth = async () => ({sub:'conta', email:'antigo@example.com', nome:'Antigo', papel:'ADMIN', foto:'https://perfil.example/foto.png', nonce:'nonce-original', escopo:'openid ssf.manage'});
    export const escopoConcedido = (escopo, {papel}) => papel === 'ADMIN' ? escopo : 'openid';
    export const assinarAccessToken = identidade => { f.identidadeEmitida = identidade; return 'access'; };
    export const assinarIdToken = async () => 'id-token';
  `,
};
register(dataUrl(`
  const fontes = ${JSON.stringify(Object.fromEntries(Object.entries(fontes).map(([key, value]) => [key, dataUrl(value)])))};
  export function resolve(specifier, context, next) {
    if (fontes[specifier]) return {url:fontes[specifier],shortCircuit:true};
    return next(specifier,context);
  }
`), import.meta.url);

const { NextRequest } = await import("next/server.js");
const { POST } = await import("@/app/oauth/token/route");
const pedir = (grant: string) => POST(new NextRequest("https://auth.example/oauth/token", {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: grant, code: "codigo", refresh_token: "refresh", redirect_uri: "https://produto.example/callback" }),
}));

beforeEach(() => {
  fixture.conta = { ...atual };
  fixture.app = { id: "produto" };
  fixture.permitido = true;
  fixture.emitidos = 0;
  fixture.revogados = [];
  fixture.identidadeEmitida = null;
  fixture.identidadeAutorizada = null;
});

for (const grant of ["authorization_code", "refresh_token"]) {
  describe(`autorização atual no token endpoint: ${grant}`, () => {
    for (const motivo of ["aplicação desativada", "conta inativa ou removida", "permissão revogada"]) {
      it(`recusa ${motivo} antes de emitir tokens`, async () => {
        if (motivo === "aplicação desativada") fixture.app = null;
        if (motivo === "conta inativa ou removida") fixture.conta = null;
        if (motivo === "permissão revogada") fixture.permitido = false;
        const resposta = await pedir(grant);
        assert.equal(resposta.status, 400);
        assert.equal((await resposta.json()).error, "invalid_grant");
        assert.equal(fixture.emitidos, 0);
        assert.equal(fixture.identidadeEmitida, null);
        assert.deepEqual(fixture.revogados, grant === "refresh_token" ? ["familia"] : []);
      });
    }

    it("revalida com identidade atual e retira escopo privilegiado após mudança de papel", async () => {
      const resposta = await pedir(grant);
      assert.equal(resposta.status, 200);
      assert.deepEqual(fixture.identidadeAutorizada, { email: atual.email, papel: atual.papel });
      assert.deepEqual(fixture.identidadeEmitida, {
        ...atual, foto: grant === "authorization_code" ? "https://perfil.example/foto.png" : null,
      });
      assert.equal((await resposta.json()).scope, "openid");
      assert.equal(fixture.emitidos, 1);
    });
  });
}
