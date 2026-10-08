import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  ESCOPOS_PADRAO,
  coletarAtivos,
  graphLista,
  lerEscopos,
  lerPedidoAssinado,
  provaSegredo,
  trocarCodigoMeta,
  urlConexao,
  type Buscar,
} from "@/lib/meta";

const SEGREDO = "segredo-do-app";

function assinar(payload: Record<string, unknown>, segredo = SEGREDO): string {
  const corpo = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const assinatura = createHmac("sha256", segredo).update(corpo).digest("base64url");
  return `${assinatura}.${corpo}`;
}

/** Graph de mentira: responde pelo caminho da URL e guarda o que foi pedido. */
function graphFalsa(rotas: Record<string, unknown>): { buscar: Buscar; pedidos: URL[] } {
  const pedidos: URL[] = [];
  const buscar: Buscar = async (url) => {
    const u = new URL(url);
    pedidos.push(u);
    const caminho = u.pathname.replace(/^\/v[\d.]+/, "");
    if (!(caminho in rotas)) return new Response(JSON.stringify({ error: { message: "desconhecido", code: 100 } }), { status: 400 });
    return new Response(JSON.stringify(rotas[caminho]), { status: 200 });
  };
  return { buscar, pedidos };
}

/**
 * É a assinatura que separa "a Meta mandou apagar" de "alguém na internet
 * mandou apagar os dados de outra pessoa".
 */
describe("signed_request da Meta", () => {
  it("aceita pedido assinado com o segredo do app", () => {
    const p = lerPedidoAssinado(assinar({ algorithm: "HMAC-SHA256", user_id: "123", issued_at: 1700000000 }), SEGREDO);
    assert.deepEqual(p, { userId: "123", emitidoEm: 1700000000 });
  });

  it("recusa assinatura feita com outro segredo", () => {
    assert.equal(lerPedidoAssinado(assinar({ algorithm: "HMAC-SHA256", user_id: "123" }, "outro"), SEGREDO), null);
  });

  it("recusa payload trocado depois de assinado", () => {
    const [assinatura] = assinar({ algorithm: "HMAC-SHA256", user_id: "123" }).split(".");
    const outro = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "999" })).toString("base64url");
    assert.equal(lerPedidoAssinado(`${assinatura}.${outro}`, SEGREDO), null);
  });

  it("recusa algoritmo diferente, pedido sem usuário e lixo", () => {
    assert.equal(lerPedidoAssinado(assinar({ algorithm: "none", user_id: "123" }), SEGREDO), null);
    assert.equal(lerPedidoAssinado(assinar({ algorithm: "HMAC-SHA256" }), SEGREDO), null);
    assert.equal(lerPedidoAssinado("sem-ponto", SEGREDO), null);
    assert.equal(lerPedidoAssinado("", SEGREDO), null);
    assert.equal(lerPedidoAssinado(undefined, SEGREDO), null);
  });

  it("sem segredo configurado não aceita nada", () => {
    assert.equal(lerPedidoAssinado(assinar({ algorithm: "HMAC-SHA256", user_id: "123" }, ""), ""), null);
  });
});

describe("permissões pedidas na conexão", () => {
  it("vazio cai na lista padrão", () => {
    assert.deepEqual(lerEscopos(""), [...ESCOPOS_PADRAO]);
    assert.deepEqual(lerEscopos(null), [...ESCOPOS_PADRAO]);
  });

  it("aceita espaço, vírgula e quebra de linha, sem repetir", () => {
    assert.deepEqual(lerEscopos("pages_show_list, ads_read\nads_read  PAGES_SHOW_LIST"), ["pages_show_list", "ads_read", "public_profile"]);
  });

  it("descarta o que não tem cara de escopo — não vai parar na URL", () => {
    assert.deepEqual(lerEscopos("ads_read &redirect_uri=https://evil.io 123"), ["ads_read", "public_profile"]);
  });
});

describe("diálogo de autorização", () => {
  const base = { clientId: "app1", redirectUri: "https://auth.avilaops.com/api/meta/callback", state: "abc" };

  it("pede os escopos separados por vírgula", () => {
    const u = new URL(urlConexao({ ...base, escopos: ["pages_show_list", "ads_read"] }));
    assert.equal(u.searchParams.get("scope"), "pages_show_list,ads_read");
    assert.equal(u.searchParams.get("state"), "abc");
    assert.equal(u.searchParams.get("redirect_uri"), base.redirectUri);
    assert.equal(u.searchParams.get("config_id"), null);
  });

  it("com configuração do Login para Empresas, ela substitui os escopos", () => {
    const u = new URL(urlConexao({ ...base, escopos: ["ads_read"], configId: "777" }));
    assert.equal(u.searchParams.get("config_id"), "777");
    assert.equal(u.searchParams.get("scope"), null);
  });
});

describe("chamadas à Graph", () => {
  it("appsecret_proof é o HMAC do token com o segredo", () => {
    assert.equal(provaSegredo("tok", SEGREDO), createHmac("sha256", SEGREDO).update("tok").digest("hex"));
  });

  it("toda chamada leva a prova junto do token", async () => {
    const { buscar, pedidos } = graphFalsa({ "/me/accounts": { data: [] } });
    await graphLista("/me/accounts", {}, { token: "tok", segredo: SEGREDO, buscar });
    assert.equal(pedidos[0].searchParams.get("access_token"), "tok");
    assert.equal(pedidos[0].searchParams.get("appsecret_proof"), provaSegredo("tok", SEGREDO));
  });

  it("segue a paginação", async () => {
    let chamadas = 0;
    const buscar: Buscar = async () => {
      chamadas++;
      return new Response(
        JSON.stringify(chamadas === 1 ? { data: [{ id: "1" }], paging: { next: "https://graph.facebook.com/v21.0/proxima" } } : { data: [{ id: "2" }] }),
      );
    };
    const itens = await graphLista<{ id: string }>("/me/accounts", {}, { token: "t", segredo: SEGREDO, buscar });
    assert.deepEqual(itens.map((i) => i.id), ["1", "2"]);
  });

  it("troca o código pelo token longo, não pelo curto", async () => {
    const buscar: Buscar = async (url) => {
      const u = new URL(url);
      return new Response(
        JSON.stringify(
          u.searchParams.get("grant_type") === "fb_exchange_token"
            ? { access_token: `longo-de-${u.searchParams.get("fb_exchange_token")}`, expires_in: 5184000 }
            : { access_token: "curto", expires_in: 3600 },
        ),
      );
    };
    const t = await trocarCodigoMeta({ clientId: "a", clientSecret: SEGREDO, redirectUri: "https://x/cb", code: "c", buscar });
    assert.equal(t.token, "longo-de-curto");
    assert.ok(t.expiraEm && t.expiraEm.getTime() - Date.now() > 50 * 24 * 3600 * 1000);
  });

  it("erro da Graph vira exceção, não token vazio", async () => {
    const buscar: Buscar = async () => new Response(JSON.stringify({ error: { message: "código usado", code: 100 } }), { status: 400 });
    await assert.rejects(
      trocarCodigoMeta({ clientId: "a", clientSecret: SEGREDO, redirectUri: "https://x/cb", code: "c", buscar }),
      /código usado/,
    );
  });
});

describe("coleta de ativos", () => {
  const rotas = {
    "/me/accounts": {
      data: [
        { id: "p1", name: "Padaria", category: "Padaria", access_token: "tok-p1", tasks: ["MANAGE"], followers_count: 1200, instagram_business_account: { id: "ig1", username: "padaria" } },
        { id: "p2", name: "Sem Insta", access_token: "tok-p2" },
      ],
    },
    "/me/adaccounts": { data: [{ id: "act_9", account_id: "9", name: "Anúncios", account_status: 1, currency: "BRL" }] },
    "/me/businesses": { data: [{ id: "b1", name: "Padaria LTDA", verification_status: "verified" }] },
    "/b1/owned_whatsapp_business_accounts": {
      data: [{ id: "w1", name: "Atendimento", phone_numbers: { data: [{ id: "n1", display_phone_number: "+55 16 99999-0000" }] } }],
    },
    "/b1/owned_product_catalogs": { data: [{ id: "c1", name: "Pães", product_count: 42 }] },
  };
  const tudo = ["pages_show_list", "pages_read_engagement", "instagram_basic", "ads_read", "business_management", "whatsapp_business_management", "catalog_management"];

  it("traduz cada tipo e guarda o token da Página", async () => {
    const { buscar } = graphFalsa(rotas);
    const c = await coletarAtivos({ token: "t", segredo: SEGREDO, buscar }, tudo);

    assert.ok(c.pagina !== "falhou" && c.instagram !== "falhou" && c.whatsapp !== "falhou" && c.catalogo !== "falhou");
    assert.deepEqual(c.pagina.map((p) => [p.externoId, p.token]), [["p1", "tok-p1"], ["p2", "tok-p2"]]);
    assert.equal(c.pagina[0].detalhe.seguidores, 1200);
    assert.deepEqual(c.instagram.map((i) => [i.externoId, i.nome]), [["ig1", "@padaria"]]);
    assert.equal(c.whatsapp[0].detalhe.numeroIds, "n1");
    assert.equal(c.catalogo[0].detalhe.produtos, 42);
    assert.ok(c.conta_anuncio !== "falhou" && c.conta_anuncio[0].detalhe.ativa === true);
    assert.ok(c.negocio !== "falhou" && c.negocio[0].nome === "Padaria LTDA");
  });

  it("não chama o que a pessoa não concedeu, nem pede campo sem permissão", async () => {
    const { buscar, pedidos } = graphFalsa(rotas);
    const c = await coletarAtivos({ token: "t", segredo: SEGREDO, buscar }, ["pages_show_list"]);

    assert.deepEqual(pedidos.map((p) => p.pathname), ["/v21.0/me/accounts"]);
    const campos = pedidos[0].searchParams.get("fields") ?? "";
    assert.ok(!campos.includes("instagram_business_account"));
    assert.ok(!campos.includes("followers_count"));
    assert.deepEqual(c.conta_anuncio, []);
    assert.deepEqual(c.negocio, []);
  });

  it("falha da Graph marca o tipo como falho em vez de lista vazia", async () => {
    // Lista vazia apagaria as Páginas guardadas; "falhou" preserva.
    const { buscar } = graphFalsa({ "/me/adaccounts": rotas["/me/adaccounts"] });
    const c = await coletarAtivos({ token: "t", segredo: SEGREDO, buscar }, tudo);

    assert.equal(c.pagina, "falhou");
    assert.equal(c.instagram, "falhou");
    assert.equal(c.negocio, "falhou");
    assert.equal(c.whatsapp, "falhou");
    assert.equal(c.catalogo, "falhou");
    assert.ok(c.conta_anuncio !== "falhou" && c.conta_anuncio.length === 1);
  });
});
