import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  base32Codificar,
  base32Decodificar,
  codigoDoContador,
  contadorAgora,
  gerarSegredo,
  segredoLegivel,
  uriOtpauth,
  verificarCodigo,
} from "@/lib/totp";

/**
 * O segredo do apêndice B do RFC 6238: a cadeia ASCII "12345678901234567890".
 * É contra ele que a norma publica os códigos esperados.
 */
const SEGREDO_RFC = base32Codificar(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("codifica o segredo do RFC em base32", () => {
    assert.equal(SEGREDO_RFC, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("reproduz os vetores do RFC 6238 (SHA-1, 6 dígitos)", () => {
    // [segundos desde a época, código esperado] — apêndice B, truncado a 6.
    const vetores: [number, string][] = [
      [59, "287082"],
      [1111111109, "081804"],
      [1111111111, "050471"],
      [1234567890, "005924"],
      [2000000000, "279037"],
      [20000000000, "353130"],
    ];
    for (const [segundos, esperado] of vetores) {
      assert.equal(codigoDoContador(SEGREDO_RFC, Math.floor(segundos / 30)), esperado, `t=${segundos}`);
    }
  });

  it("aceita o segredo como a pessoa digita: minúsculo, com espaço e com padding", () => {
    const bytes = base32Decodificar("gezd gnbv gy3t qojq gezd gnbv gy3t qojq=");
    assert.equal(base32Codificar(bytes), SEGREDO_RFC);
  });

  it("recusa base32 inválida em vez de gerar código silenciosamente errado", () => {
    assert.throws(() => base32Decodificar("não-é-base32!"));
  });

  it("gera segredo de 160 bits, o tamanho da chave HMAC-SHA1 do RFC 4226", () => {
    const segredo = gerarSegredo();
    assert.equal(base32Decodificar(segredo).length, 20);
    assert.equal(segredo.length, 32);
    assert.notEqual(segredo, gerarSegredo());
  });
});

describe("verificação do código", () => {
  const agoraMs = 1234567890 * 1000;
  const contador = contadorAgora(agoraMs);

  it("aceita o código do intervalo atual e devolve o contador que casou", () => {
    assert.equal(verificarCodigo(SEGREDO_RFC, "005924", { agoraMs }), contador);
  });

  it("tolera um intervalo para cada lado (relógio de celular adiantado ou atrasado)", () => {
    for (const desvio of [-1, 1]) {
      const codigo = codigoDoContador(SEGREDO_RFC, contador + desvio);
      assert.equal(verificarCodigo(SEGREDO_RFC, codigo, { agoraMs }), contador + desvio);
    }
  });

  it("não aceita além da janela", () => {
    for (const desvio of [-2, 2]) {
      const codigo = codigoDoContador(SEGREDO_RFC, contador + desvio);
      assert.equal(verificarCodigo(SEGREDO_RFC, codigo, { agoraMs }), null);
    }
  });

  it("recusa código já usado — é o anti-replay que sustenta o fator", () => {
    // Quem viu o código por cima do ombro tem 30 segundos para reusá-lo; o
    // contador guardado é o que fecha essa janela.
    assert.equal(verificarCodigo(SEGREDO_RFC, "005924", { agoraMs, minimoContador: contador }), null);
    const anterior = codigoDoContador(SEGREDO_RFC, contador - 1);
    assert.equal(verificarCodigo(SEGREDO_RFC, anterior, { agoraMs, minimoContador: contador }), null);
  });

  it("aceita o código seguinte depois de um uso", () => {
    const proximo = codigoDoContador(SEGREDO_RFC, contador + 1);
    assert.equal(verificarCodigo(SEGREDO_RFC, proximo, { agoraMs, minimoContador: contador }), contador + 1);
  });

  it("recusa entrada que não é um código de seis dígitos", () => {
    for (const lixo of ["", "abc", "12345", "1234567", "  ", "00592a"]) {
      assert.equal(verificarCodigo(SEGREDO_RFC, lixo, { agoraMs }), null, lixo);
    }
  });
});

describe("URI do QR", () => {
  it("monta o otpauth:// com emissor repetido no rótulo e no parâmetro", () => {
    const uri = uriOtpauth({ conta: "teste@avilaops.com", segredo: SEGREDO_RFC });
    const url = new URL(uri);
    assert.equal(url.protocol, "otpauth:");
    assert.equal(url.host, "totp"); // o tipo é o host da URI, por definição do Key Uri Format
    assert.equal(decodeURIComponent(url.pathname), "/Avila Ops:teste@avilaops.com");
    assert.equal(url.searchParams.get("issuer"), "Avila Ops");
    assert.equal(url.searchParams.get("secret"), SEGREDO_RFC);
    assert.equal(url.searchParams.get("digits"), "6");
    assert.equal(url.searchParams.get("period"), "30");
  });

  it("escapa o espaço do emissor como %20, não como +", () => {
    // Autenticador que segue o Key Uri Format ao pé da letra mostra "Avila+Ops"
    // na lista quando o espaço vira `+`.
    const uri = uriOtpauth({ conta: "a@b.com", segredo: SEGREDO_RFC });
    assert.match(uri, /issuer=Avila%20Ops/);
    assert.doesNotMatch(uri, /issuer=Avila\+Ops/);
  });

  it("quebra o segredo em blocos de quatro para quem digita à mão", () => {
    assert.equal(segredoLegivel("GEZDGNBVGY3TQOJQ"), "GEZD GNBV GY3T QOJQ");
  });
});
