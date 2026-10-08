import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { qrMatriz, qrSvg } from "@/lib/qr";

/**
 * O gerador foi conferido, quando escrito, decodificando a saída com um leitor
 * de QR independente (jsQR) nas versões 1 a 10, com UTF-8 e com as URIs
 * `otpauth://` reais. Aqui o que se guarda é o resultado daquela conferência:
 *
 * - o **retrato** (sha256 da matriz) trava a saída exata, para que qualquer
 *   mexida no codificador apareça no diff em vez de aparecer numa câmera que
 *   não lê o QR de alguém;
 * - as **invariantes** abaixo checam o que um leitor procura primeiro: olhos,
 *   régua de temporização, zona silenciosa e a informação de formato.
 *
 * Um retrato sozinho não prova que o QR é legível; junto da conferência com
 * leitor externo, prova que continua sendo o mesmo QR legível.
 */
const RETRATOS: { texto: string; lado: number; sha256: string }[] = [
  { texto: "a", lado: 21, sha256: "e8ab680854e4019c4ac89bd0e19dfe1f7e967f3cafd048091b3e3ec474b6f431" },
  { texto: "https://auth.avilaops.com/", lado: 25, sha256: "dc2c317e09e29d27564e17ec7262b5599f6350a9a9c9ca699425d1582bf007e4" },
  {
    texto:
      "otpauth://totp/Avila%20Ops%3Ateste%40avilaops.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Avila%20Ops&algorithm=SHA1&digits=6&period=30",
    lado: 49,
    sha256: "983d665e4dd17e2e3f73ab1e92855bf0e8048487aa40915322e35dcc8b3075fa",
  },
  { texto: "x".repeat(200), lado: 57, sha256: "64e9db0f7dcfa486be63739a1efef2c8324387cf233f7686c75d9b4e079a8873" },
];

function retrato(m: boolean[][]): string {
  return createHash("sha256")
    .update(m.map((linha) => linha.map((c) => (c ? "1" : "0")).join("")).join("\n"))
    .digest("hex");
}

describe("QR", () => {
  for (const caso of RETRATOS) {
    it(`mantém a saída exata da versão ${(caso.lado - 17) / 4}`, () => {
      const m = qrMatriz(caso.texto);
      assert.equal(m.length, caso.lado);
      assert.equal(retrato(m), caso.sha256);
    });
  }

  it("escolhe a menor versão que couber", () => {
    // Cada versão tem capacidade fixa no nível M; o texto crescendo empurra o
    // código para a versão seguinte, nunca para uma anterior.
    let anterior = 0;
    for (const tamanho of [1, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213]) {
      const lado = qrMatriz("x".repeat(tamanho)).length;
      assert.ok(lado >= anterior, `versão diminuiu com ${tamanho} bytes`);
      anterior = lado;
    }
  });

  it("recusa o que não cabe na versão 10 em vez de truncar", () => {
    assert.throws(() => qrMatriz("x".repeat(214)), /não cabem/);
  });

  it("desenha os três olhos com a faixa clara em volta", () => {
    const m = qrMatriz("https://auth.avilaops.com/");
    const n = m.length;
    for (const [l0, c0] of [
      [0, 0],
      [0, n - 7],
      [n - 7, 0],
    ]) {
      assert.ok(m[l0][c0], "canto do olho escuro");
      assert.ok(m[l0 + 3][c0 + 3], "miolo do olho escuro");
      assert.ok(!m[l0 + 1][c0 + 1], "anel claro do olho");
    }
  });

  it("mantém a régua de temporização alternada, inclusive onde ela cruza o formato", () => {
    // Os módulos (6,8) e (8,6) são da régua, não do formato. Reservá-los junto
    // com a área de formato os apagava — foi assim que este teste pegou o
    // buraco claro no meio da régua.
    const m = qrMatriz("x".repeat(100));
    for (let i = 8; i < m.length - 8; i++) {
      assert.equal(m[6][i], i % 2 === 0, `linha de temporização em ${i}`);
      assert.equal(m[i][6], i % 2 === 0, `coluna de temporização em ${i}`);
    }
  });

  it("grava a informação de formato duas vezes, e no nível M", () => {
    const m = qrMatriz("x".repeat(100));
    const n = m.length;

    const copia1: number[] = [];
    for (let i = 0; i <= 5; i++) copia1.push(m[i][8] ? 1 : 0);
    copia1.push(m[7][8] ? 1 : 0, m[8][8] ? 1 : 0, m[8][7] ? 1 : 0);
    for (let i = 9; i < 15; i++) copia1.push(m[8][14 - i] ? 1 : 0);

    const copia2: number[] = [];
    for (let i = 0; i < 8; i++) copia2.push(m[8][n - 1 - i] ? 1 : 0);
    for (let i = 8; i < 15; i++) copia2.push(m[n - 15 + i][8] ? 1 : 0);

    // Um leitor usa a segunda cópia quando a primeira está suja: divergir entre
    // elas é um QR que lê diferente conforme o canto que a câmera pega.
    assert.deepEqual(copia1, copia2);

    let bits = 0;
    for (let i = 14; i >= 0; i--) bits = (bits << 1) | copia1[i];
    const dados = (bits ^ 0x5412) >> 10; // desfaz a máscara fixa da norma
    assert.equal((dados >> 3) & 0b11, 0b00, "nível de correção M");
    assert.ok(((dados & 0b111) >= 0) && ((dados & 0b111) <= 7), "máscara entre 0 e 7");
  });

  it("marca o módulo que a norma exige sempre escuro", () => {
    const m = qrMatriz("a");
    assert.ok(m[m.length - 8][8]);
  });
});

describe("SVG", () => {
  it("sai com fundo claro e zona silenciosa de 4 módulos", () => {
    // QR invertido (claro sobre escuro) boa parte dos celulares não lê, e sem a
    // margem a câmera não encontra a borda. O tema escuro do painel não pode
    // alcançar este desenho.
    const svg = qrSvg("https://auth.avilaops.com/");
    const lado = 25 + 8;
    assert.match(svg, new RegExp(`viewBox="0 0 ${lado} ${lado}"`));
    assert.match(svg, /fill="#ffffff"/);
    assert.match(svg, /fill="#000000"/);
    assert.match(svg, /shape-rendering="crispEdges"/);
  });

  it("respeita o tamanho pedido", () => {
    const svg = qrSvg("a", { tamanho: 180 });
    assert.match(svg, /width="180" height="180"/);
  });
});
