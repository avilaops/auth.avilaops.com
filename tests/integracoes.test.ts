import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { validarIntegracao } from "@/lib/clientesOidc";
import { gerarSegredoCliente, lerCredencialCliente, lerRedirectUris, segredoConfere, type ClienteOIDC } from "@/lib/oidc";

const base = { appId: "crm", nome: "CRM", acessoMeta: false, ativo: true };

/**
 * O endereço de retorno é o que impede um código de login de ir parar num
 * site qualquer. Estas regras são a diferença entre "cadastrei errado" e
 * "entreguei a sessão de um cliente".
 */
describe("validação de integração", () => {
  it("aceita https e normaliza o identificador", () => {
    const v = validarIntegracao({ ...base, id: " CRM ", redirectUris: "https://crm.avilaops.com/cb\n\n https://crm.avilaops.com/cb2 " }, { exigeRetorno: true });
    assert.ok(v.ok);
    assert.equal(v.dados.id, "crm");
    assert.equal(v.dados.redirectUris, "https://crm.avilaops.com/cb\nhttps://crm.avilaops.com/cb2");
  });

  it("recusa http fora de localhost, curinga e fragmento", () => {
    for (const uri of ["http://crm.avilaops.com/cb", "https://*.avilaops.com/cb", "https://crm.avilaops.com/cb#x", "nao-e-url"]) {
      assert.equal(validarIntegracao({ ...base, id: "crm", redirectUris: uri }, { exigeRetorno: true }).ok, false, uri);
    }
    assert.ok(validarIntegracao({ ...base, id: "crm", redirectUris: "http://localhost:3000/cb" }, { exigeRetorno: true }).ok);
  });

  it("sem retorno só passa quando a integração é só de API", () => {
    assert.equal(validarIntegracao({ ...base, id: "crm", redirectUris: "" }, { exigeRetorno: true }).ok, false);
    assert.ok(validarIntegracao({ ...base, id: "crm", redirectUris: "", acessoMeta: true }, { exigeRetorno: false }).ok);
  });

  it("recusa identificador com espaço, maiúscula no meio de símbolo ou curto demais", () => {
    for (const id of ["a", "meu app", "crm_1", "-crm", "crm/x"]) {
      assert.equal(validarIntegracao({ ...base, id, redirectUris: "https://x.avilaops.com/cb" }, { exigeRetorno: true }).ok, false, id);
    }
  });
});

describe("segredo de cliente", () => {
  const cliente = (extra: Partial<ClienteOIDC>): ClienteOIDC => ({ id: "x", appId: "x", nome: "X", redirectUris: [], acessoMeta: false, origem: "painel", ...extra });

  it("o hash guardado confere com o segredo gerado, e só com ele", () => {
    const { segredo, hash } = gerarSegredoCliente();
    assert.equal(segredo.length, 64);
    assert.equal(hash, createHash("sha256").update(segredo).digest("hex"));
    const c = cliente({ segredoHash: hash });
    assert.equal(segredoConfere(c, segredo), true);
    assert.equal(segredoConfere(c, segredo.slice(0, -1) + (segredo.endsWith("0") ? "1" : "0")), false);
    assert.equal(segredoConfere(c, ""), false);
    assert.equal(segredoConfere(c, undefined), false);
  });

  it("cliente do código continua conferindo pela variável de ambiente", () => {
    process.env.OIDC_SEGREDO_TESTE = "valor-do-env";
    const c = cliente({ origem: "codigo", envSegredo: "OIDC_SEGREDO_TESTE" });
    assert.equal(segredoConfere(c, "valor-do-env"), true);
    assert.equal(segredoConfere(c, "outro"), false);
    delete process.env.OIDC_SEGREDO_TESTE;
    assert.equal(segredoConfere(c, "valor-do-env"), false);
  });

  it("cliente sem segredo configurado não aceita nada", () => {
    assert.equal(segredoConfere(cliente({}), "qualquer"), false);
  });
});

describe("credencial na requisição", () => {
  it("lê Basic e decodifica caracteres especiais", () => {
    const b = Buffer.from(`${encodeURIComponent("meu:id")}:${encodeURIComponent("s3gr/do")}`).toString("base64");
    assert.deepEqual(lerCredencialCliente(`Basic ${b}`), { id: "meu:id", segredo: "s3gr/do" });
  });

  it("lê do corpo quando não há cabeçalho", () => {
    assert.deepEqual(lerCredencialCliente(null, new URLSearchParams({ client_id: "a", client_secret: "b" })), { id: "a", segredo: "b" });
  });

  it("Basic malformado não cai para o corpo", () => {
    const corpo = new URLSearchParams({ client_id: "a", client_secret: "b" });
    assert.equal(lerCredencialCliente(`Basic ${Buffer.from("semdoispontos").toString("base64")}`, corpo), null);
    assert.equal(lerCredencialCliente(null), null);
  });

  it("endereços de retorno: um por linha, sem vazios", () => {
    assert.deepEqual(lerRedirectUris("a\r\n\n  b  \n"), ["a", "b"]);
  });
});
