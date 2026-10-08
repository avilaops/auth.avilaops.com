/**
 * Gerador de QR Code — só o necessário para o cadastro do segundo fator.
 *
 * Modo byte, correção de erro M, versões 1 a 10 (até 213 bytes; a URI
 * `otpauth://` do TOTP tem cerca de 130). É a norma ISO/IEC 18004 escrita em
 * uma tela: polinômio de Reed-Solomon em GF(256), máscara escolhida por
 * penalidade e os padrões de posição, alinhamento e temporização.
 *
 * Por que não uma biblioteca: o QR carrega o segredo do segundo fator. Trazer
 * um pacote de terceiro para desenhá-lo coloca a chave de MFA de toda a equipe
 * na mão de uma dependência transitiva — e o `auth` é a raiz de confiança do
 * ecossistema inteiro. Aqui o código é auditável em diff, como o resto.
 */

/** Matriz de módulos: `true` é escuro. Linha 0 é o topo. */
export type Matriz = boolean[][];

/**
 * Por versão (1–10), no nível M: corretores por bloco, e os dois grupos de
 * blocos de dados. Tabela 9 da norma — os números não se derivam, se consultam.
 */
const BLOCOS: Record<number, { ec: number; g1: number; d1: number; g2: number; d2: number }> = {
  1: { ec: 10, g1: 1, d1: 16, g2: 0, d2: 0 },
  2: { ec: 16, g1: 1, d1: 28, g2: 0, d2: 0 },
  3: { ec: 26, g1: 1, d1: 44, g2: 0, d2: 0 },
  4: { ec: 18, g1: 2, d1: 32, g2: 0, d2: 0 },
  5: { ec: 24, g1: 2, d1: 43, g2: 0, d2: 0 },
  6: { ec: 16, g1: 4, d1: 27, g2: 0, d2: 0 },
  7: { ec: 18, g1: 4, d1: 31, g2: 0, d2: 0 },
  8: { ec: 22, g1: 2, d1: 38, g2: 2, d2: 39 },
  9: { ec: 22, g1: 3, d1: 36, g2: 2, d2: 37 },
  10: { ec: 26, g1: 4, d1: 43, g2: 1, d2: 44 },
};

/** Centros dos padrões de alinhamento por versão. */
const ALINHAMENTO: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

const VERSAO_MAX = 10;

// ---------------------------------------------------------------- GF(256)

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // polinômio primitivo da norma
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

function mult(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

/** g(x) = ∏ (x − α^i), coeficientes do maior grau para o menor. */
function polinomioGerador(grau: number): number[] {
  let g = [1];
  for (let i = 0; i < grau; i++) {
    const novo = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      novo[j] ^= g[j];
      novo[j + 1] ^= mult(g[j], EXP[i]);
    }
    g = novo;
  }
  return g;
}

/** Resto da divisão — são os códigos corretores do bloco. */
function corretores(dados: number[], grau: number): number[] {
  const g = polinomioGerador(grau);
  const resto = new Array<number>(grau).fill(0);
  for (const d of dados) {
    const fator = d ^ resto[0];
    resto.shift();
    resto.push(0);
    if (fator !== 0) for (let i = 0; i < grau; i++) resto[i] ^= mult(g[i + 1], fator);
  }
  return resto;
}

// ------------------------------------------------------------ codificação

function capacidade(versao: number): number {
  const b = BLOCOS[versao];
  const dados = b.g1 * b.d1 + b.g2 * b.d2;
  // Cabeçalho: 4 bits de modo + o contador de bytes (8 bits até a versão 9,
  // 16 a partir da 10).
  return Math.floor((dados * 8 - (4 + (versao >= 10 ? 16 : 8))) / 8);
}

function escolherVersao(bytes: number): number {
  for (let v = 1; v <= VERSAO_MAX; v++) if (capacidade(v) >= bytes) return v;
  throw new Error(`QR: ${bytes} bytes não cabem na versão ${VERSAO_MAX}`);
}

function codewordsDeDados(texto: string, versao: number): number[] {
  const bytes = Array.from(Buffer.from(texto, "utf8"));
  const b = BLOCOS[versao];
  const total = b.g1 * b.d1 + b.g2 * b.d2;

  const bits: number[] = [];
  const escrever = (valor: number, tamanho: number) => {
    for (let i = tamanho - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };

  escrever(0b0100, 4); // modo byte
  escrever(bytes.length, versao >= 10 ? 16 : 8);
  for (const byte of bytes) escrever(byte, 8);

  // Terminador de até 4 bits e completar o último byte.
  for (let i = 0; i < 4 && bits.length < total * 8; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const cw: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    cw.push(byte);
  }
  // Preenchimento alternado da norma até encher a capacidade.
  for (let i = 0; cw.length < total; i++) cw.push(i % 2 === 0 ? 0xec : 0x11);
  return cw;
}

/**
 * Intercala os blocos. A norma espalha os codewords para que um borrão de
 * tinta estrague um pedaço de cada bloco — e não um bloco inteiro, que seria
 * irrecuperável.
 */
function codewordsFinais(texto: string, versao: number): number[] {
  const b = BLOCOS[versao];
  const dados = codewordsDeDados(texto, versao);

  const blocos: number[][] = [];
  const ecs: number[][] = [];
  let pos = 0;
  for (let i = 0; i < b.g1 + b.g2; i++) {
    const tamanho = i < b.g1 ? b.d1 : b.d2;
    const bloco = dados.slice(pos, pos + tamanho);
    pos += tamanho;
    blocos.push(bloco);
    ecs.push(corretores(bloco, b.ec));
  }

  const saida: number[] = [];
  const maiorDado = Math.max(b.d1, b.d2);
  for (let i = 0; i < maiorDado; i++) for (const bloco of blocos) if (i < bloco.length) saida.push(bloco[i]);
  for (let i = 0; i < b.ec; i++) for (const ec of ecs) saida.push(ec[i]);
  return saida;
}

// ------------------------------------------------------------- desenho

type Tela = { tamanho: number; m: boolean[][]; fixo: boolean[][] };

function novaTela(versao: number): Tela {
  const tamanho = 17 + 4 * versao;
  return {
    tamanho,
    m: Array.from({ length: tamanho }, () => new Array<boolean>(tamanho).fill(false)),
    fixo: Array.from({ length: tamanho }, () => new Array<boolean>(tamanho).fill(false)),
  };
}

function fixar(t: Tela, linha: number, coluna: number, escuro: boolean) {
  if (linha < 0 || coluna < 0 || linha >= t.tamanho || coluna >= t.tamanho) return;
  t.m[linha][coluna] = escuro;
  t.fixo[linha][coluna] = true;
}

function padroesFixos(t: Tela, versao: number) {
  const n = t.tamanho;

  // Três olhos, com a faixa clara de separação em volta.
  for (const [l, c] of [[0, 0], [0, n - 7], [n - 7, 0]] as const) {
    for (let i = -1; i <= 7; i++) {
      for (let j = -1; j <= 7; j++) {
        const dentro = i >= 0 && i <= 6 && j >= 0 && j <= 6;
        const escuro = dentro && (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4));
        fixar(t, l + i, c + j, escuro);
      }
    }
  }

  // Temporização: a régua que diz ao leitor o tamanho do módulo.
  for (let i = 8; i < n - 8; i++) {
    fixar(t, 6, i, i % 2 === 0);
    fixar(t, i, 6, i % 2 === 0);
  }

  // Alinhamento, menos onde bateria nos olhos.
  const centros = ALINHAMENTO[versao];
  for (const l of centros) {
    for (const c of centros) {
      const perto = (l <= 8 && c <= 8) || (l <= 8 && c >= n - 9) || (l >= n - 9 && c <= 8);
      if (perto) continue;
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          fixar(t, l + i, c + j, Math.max(Math.abs(i), Math.abs(j)) !== 1);
        }
      }
    }
  }

  // Área do formato: reservada agora, escrita depois de escolher a máscara.
  //
  // A linha e a coluna 6 ficam de fora: ali passa a temporização, e a norma
  // manda a informação de formato pular esses dois módulos — (6,8) e (8,6)
  // pertencem à régua. Reservá-los junto os apagava, e a régua saía com um
  // buraco claro onde devia haver módulo escuro. Leitor tolerante ainda lia; um
  // leitor que confere a temporização de verdade, não.
  for (let i = 0; i < 9; i++) {
    if (i === 6) continue;
    fixar(t, 8, i, false);
    fixar(t, i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    fixar(t, 8, n - 1 - i, false);
    fixar(t, n - 1 - i, 8, false);
  }
  fixar(t, n - 8, 8, true); // módulo sempre escuro

  if (versao >= 7) {
    const bits = bitsVersao(versao);
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >> i) & 1) === 1;
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      fixar(t, b, a, bit);
      fixar(t, a, b, bit);
    }
  }
}

/** BCH(18,6) da informação de versão. */
function bitsVersao(versao: number): number {
  let resto = versao;
  for (let i = 0; i < 12; i++) resto = (resto << 1) ^ (((resto >> 11) & 1) * 0x1f25);
  return (versao << 12) | (resto & 0xfff);
}

/** BCH(15,5) do formato: nível M (`00`) + máscara, mascarado com 0x5412. */
function bitsFormato(mascara: number): number {
  const dados = (0b00 << 3) | mascara;
  let resto = dados;
  for (let i = 0; i < 10; i++) resto = (resto << 1) ^ (((resto >> 9) & 1) * 0x537);
  return (((dados << 10) | (resto & 0x3ff)) ^ 0x5412) & 0x7fff;
}

function escreverFormato(t: Tela, mascara: number) {
  const n = t.tamanho;
  const bits = bitsFormato(mascara);
  const bit = (i: number) => ((bits >> i) & 1) === 1;

  for (let i = 0; i <= 5; i++) fixar(t, i, 8, bit(i));
  fixar(t, 7, 8, bit(6));
  fixar(t, 8, 8, bit(7));
  fixar(t, 8, 7, bit(8));
  for (let i = 9; i < 15; i++) fixar(t, 8, 14 - i, bit(i));

  for (let i = 0; i < 8; i++) fixar(t, 8, n - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) fixar(t, n - 15 + i, 8, bit(i));
  fixar(t, n - 8, 8, true);
}

/** Zigue-zague de baixo para cima, dois em dois, pulando a coluna de temporização. */
function preencherDados(t: Tela, cw: number[]) {
  const n = t.tamanho;
  let i = 0;
  for (let direita = n - 1; direita >= 1; direita -= 2) {
    if (direita === 6) direita = 5;
    for (let v = 0; v < n; v++) {
      for (let j = 0; j < 2; j++) {
        const coluna = direita - j;
        const subindo = ((direita + 1) & 2) === 0;
        const linha = subindo ? n - 1 - v : v;
        if (t.fixo[linha][coluna]) continue;
        if (i < cw.length * 8) {
          t.m[linha][coluna] = ((cw[i >>> 3] >> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }
}

const MASCARAS: ((l: number, c: number) => boolean)[] = [
  (l, c) => (l + c) % 2 === 0,
  (l) => l % 2 === 0,
  (_l, c) => c % 3 === 0,
  (l, c) => (l + c) % 3 === 0,
  (l, c) => (Math.floor(l / 2) + Math.floor(c / 3)) % 2 === 0,
  (l, c) => ((l * c) % 2) + ((l * c) % 3) === 0,
  (l, c) => (((l * c) % 2) + ((l * c) % 3)) % 2 === 0,
  (l, c) => (((l + c) % 2) + ((l * c) % 3)) % 2 === 0,
];

function aplicarMascara(t: Tela, mascara: number) {
  const f = MASCARAS[mascara];
  for (let l = 0; l < t.tamanho; l++) {
    for (let c = 0; c < t.tamanho; c++) {
      if (!t.fixo[l][c] && f(l, c)) t.m[l][c] = !t.m[l][c];
    }
  }
}

/**
 * Penalidade das quatro regras da norma. A máscara escolhida é a de menor
 * pontuação: a que menos parece com os padrões de posição e menos cria manchas
 * uniformes, que é o que confunde a câmera.
 */
function penalidade(t: Tela): number {
  const n = t.tamanho;
  let total = 0;

  const linhas: string[] = [];
  const colunas: string[] = [];
  for (let i = 0; i < n; i++) {
    let linha = "";
    let coluna = "";
    for (let j = 0; j < n; j++) {
      linha += t.m[i][j] ? "1" : "0";
      coluna += t.m[j][i] ? "1" : "0";
    }
    linhas.push(linha);
    colunas.push(coluna);
  }

  // Regra 1: sequências de 5 ou mais módulos iguais.
  for (const faixa of [...linhas, ...colunas]) {
    let corrida = 1;
    for (let i = 1; i < faixa.length; i++) {
      if (faixa[i] === faixa[i - 1]) corrida++;
      else {
        if (corrida >= 5) total += 3 + (corrida - 5);
        corrida = 1;
      }
    }
    if (corrida >= 5) total += 3 + (corrida - 5);
  }

  // Regra 2: blocos 2×2 de uma cor só.
  for (let l = 0; l < n - 1; l++) {
    for (let c = 0; c < n - 1; c++) {
      const v = t.m[l][c];
      if (v === t.m[l][c + 1] && v === t.m[l + 1][c] && v === t.m[l + 1][c + 1]) total += 3;
    }
  }

  // Regra 3: o desenho que imita o padrão de posição.
  for (const faixa of [...linhas, ...colunas]) {
    for (const padrao of ["10111010000", "00001011101"]) {
      let de = faixa.indexOf(padrao);
      while (de !== -1) {
        total += 40;
        de = faixa.indexOf(padrao, de + 1);
      }
    }
  }

  // Regra 4: desequilíbrio entre claro e escuro.
  let escuros = 0;
  for (const linha of linhas) for (const ch of linha) if (ch === "1") escuros++;
  const celulas = n * n;
  total += (Math.ceil(Math.abs(escuros * 20 - celulas * 10) / celulas) - 1) * 10;

  return total;
}

/** Matriz final, com a máscara de menor penalidade já aplicada. */
export function qrMatriz(texto: string): Matriz {
  const versao = escolherVersao(Buffer.byteLength(texto, "utf8"));
  const cw = codewordsFinais(texto, versao);

  let melhor: Tela | null = null;
  let melhorNota = Infinity;
  for (let mascara = 0; mascara < 8; mascara++) {
    const t = novaTela(versao);
    padroesFixos(t, versao);
    preencherDados(t, cw);
    aplicarMascara(t, mascara);
    escreverFormato(t, mascara);
    const nota = penalidade(t);
    if (nota < melhorNota) {
      melhorNota = nota;
      melhor = t;
    }
  }
  return melhor!.m;
}

/**
 * SVG pronto para embutir na página.
 *
 * Fundo branco e módulos pretos fixos, mesmo no tema escuro: leitor de QR
 * espera contraste nessa ordem, e QR invertido boa parte dos celulares não lê.
 * A margem de 4 módulos ("zona silenciosa") é exigida pela norma — sem ela a
 * câmera não encontra as bordas.
 */
export function qrSvg(texto: string, opcoes: { tamanho?: number; margem?: number } = {}): string {
  const m = qrMatriz(texto);
  const margem = opcoes.margem ?? 4;
  const lado = m.length + margem * 2;
  const tamanho = opcoes.tamanho ?? 240;

  let caminho = "";
  for (let l = 0; l < m.length; l++) {
    for (let c = 0; c < m.length; c++) {
      if (m[l][c]) caminho += `M${c + margem} ${l + margem}h1v1h-1z`;
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}"`,
    ` viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges" role="img">`,
    `<rect width="${lado}" height="${lado}" fill="#ffffff"/>`,
    `<path d="${caminho}" fill="#000000"/>`,
    `</svg>`,
  ].join("");
}
