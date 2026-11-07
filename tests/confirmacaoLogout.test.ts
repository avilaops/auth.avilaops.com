import assert from "node:assert/strict";
import { register } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

const fixture = { sessao: { email: "pessoa@example.test" } as { email: string } | null };
Object.assign(globalThis, { __confirmacaoLogout: fixture });
const dataUrl = (source: string) => "data:text/javascript," + encodeURIComponent(source);
register(dataUrl(`
  const sessao = ${JSON.stringify(dataUrl("export const lerSessao = async () => globalThis.__confirmacaoLogout.sessao;"))};
  export function resolve(specifier, context, next) {
    if (specifier === '@/lib/sessao') return { url: sessao, shortCircuit: true };
    return next(specifier, context);
  }
`), import.meta.url);
const { default: SairPage } = await import("@/app/sair/page");
const renderizar = async (parametros: Record<string, string | string[] | undefined>) =>
  renderToStaticMarkup(await SairPage({ searchParams: Promise.resolve(parametros) }));

describe("confirmação de saída da conta", () => {
  it("exibe alcance e identidade e oferece confirmar por POST ou manter sessão", async () => {
    const html = await renderizar({ client_id: "produto", post_logout_redirect_uri: "https://produto.example.test/saiu", state: "a&b" });
    assert.match(html, /pessoa@example.test/);
    assert.match(html, /sistemas conectados/);
    assert.match(html, /method="post"/);
    assert.match(html, /action="\/api\/auth\/logout\?client_id=produto&amp;post_logout_redirect_uri=https%3A%2F%2Fproduto.example.test%2Fsaiu&amp;state=a%26b"/);
    assert.match(html, /Manter minha sessão/);
    assert.match(html, /href="\/conta"/);
  });
  it("não oferece confirmar parâmetros ambíguos nem reflete um hint", async () => {
    for (const parametros of [{ client_id: ["produto", "outro"] }, { id_token_hint: "segredo-sintetico" }]) {
      const html = await renderizar(parametros);
      assert.match(html, /role="alert"/);
      assert.doesNotMatch(html, /<form|segredo-sintetico/);
    }
  });
  it("sessão ausente oferece continuar sem alegar encerrar uma sessão ativa", async () => {
    fixture.sessao = null;
    try {
      const html = await renderizar({});
      assert.match(html, /Não há sessão ativa/);
      assert.match(html, />Continuar<\/button>/);
      assert.doesNotMatch(html, /pessoa@example.test/);
    } finally {
      fixture.sessao = { email: "pessoa@example.test" };
    }
  });
});
