import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * TOTP (RFC 6238) em cima do HOTP (RFC 4226): HMAC-SHA1, 6 dígitos, janela de
 * 30 segundos. É o que Google Authenticator, 1Password, Bitwarden e Authy
 * falam por padrão — segundo fator sem depender de SMS, de operadora ou de a
 * pessoa ter sinal.
 *
 * Escrito aqui, com `node:crypto`, em vez de trazer uma biblioteca: são trinta
 * linhas de norma pública e esta é a peça que decide se alguém entra no painel.
 * Dependência a mais no SSO é dependência a mais em todo o ecossistema.
 */

/** Base32 do RFC 4648 — o alfabeto que os aplicativos autenticadores leem. */
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const PERIODO_SEGUNDOS = 30;
export const DIGITOS = 6;

/**
 * 20 bytes = 160 bits, o tamanho da chave HMAC-SHA1 recomendado pelo RFC 4226.
 * Em base32 dá 32 caracteres, que ainda cabem numa digitação manual quando a
 * câmera não lê o QR.
 */
export function gerarSegredo(bytes = 20): string {
  return base32Codificar(randomBytes(bytes));
}

export function base32Codificar(dados: Buffer): string {
  let bits = 0;
  let valor = 0;
  let saida = "";
  for (const byte of dados) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

/** Aceita minúsculas, espaços e o `=` de padding: é texto digitado por gente. */
export function base32Decodificar(texto: string): Buffer {
  const limpo = texto.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const c of limpo) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) throw new Error("segredo TOTP não é base32");
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Contador do intervalo atual: é ele, e não o relógio, que entra no HMAC. */
export function contadorAgora(agoraMs: number = Date.now()): number {
  return Math.floor(agoraMs / 1000 / PERIODO_SEGUNDOS);
}

export function codigoDoContador(segredo: string, contador: number): string {
  const bloco = Buffer.alloc(8);
  bloco.writeBigUInt64BE(BigInt(contador));
  const hmac = createHmac("sha1", base32Decodificar(segredo)).update(bloco).digest();

  // Truncagem dinâmica do RFC 4226: os 4 bits finais escolhem de onde sai o
  // número, para que o código não revele sempre o mesmo pedaço do HMAC.
  const deslocamento = hmac[hmac.length - 1] & 0x0f;
  const numero =
    ((hmac[deslocamento] & 0x7f) << 24) |
    (hmac[deslocamento + 1] << 16) |
    (hmac[deslocamento + 2] << 8) |
    hmac[deslocamento + 3];

  return String(numero % 10 ** DIGITOS).padStart(DIGITOS, "0");
}

/**
 * Confere o código e devolve **o contador que casou** — quem chama grava esse
 * número e recusa qualquer código com contador menor ou igual. Sem isso o
 * mesmo código vale pelos 30 segundos inteiros, e quem o leu por cima do ombro
 * (ou num log, ou numa gravação de tela) entra junto.
 *
 * `janela` é a tolerância em intervalos para cada lado: 1 aceita o código
 * anterior e o próximo, cobrindo relógio de celular atrasado sem abrir demais.
 */
export function verificarCodigo(
  segredo: string,
  codigo: string,
  opcoes: { janela?: number; minimoContador?: number | null; agoraMs?: number } = {},
): number | null {
  const limpo = codigo.replace(/\D/g, "");
  if (limpo.length !== DIGITOS) return null;

  const janela = opcoes.janela ?? 1;
  const atual = contadorAgora(opcoes.agoraMs);
  const minimo = opcoes.minimoContador ?? null;

  for (let d = -janela; d <= janela; d++) {
    const contador = atual + d;
    if (contador < 0) continue;
    // Código já usado (ou anterior ao último aceito) não vale de novo.
    if (minimo !== null && contador <= minimo) continue;
    if (igual(codigoDoContador(segredo, contador), limpo)) return contador;
  }
  return null;
}

/** Comparação de tempo constante: strings de 6 dígitos, sempre do mesmo tamanho. */
function igual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * URI `otpauth://` — o conteúdo do QR. O rótulo é `Emissor:conta`, repetido no
 * parâmetro `issuer`, porque é assim que os aplicativos agrupam as contas e
 * mostram "Avila Ops" em vez de um e-mail solto na lista.
 */
export function uriOtpauth(p: { conta: string; segredo: string; emissor?: string }): string {
  const emissor = p.emissor ?? "Avila Ops";
  const rotulo = encodeURIComponent(`${emissor}:${p.conta}`);
  // `encodeURIComponent` e não `URLSearchParams`: este último escreve espaço
  // como `+`, e autenticador que segue o Key Uri Format ao pé da letra mostra
  // "Avila+Ops" na lista.
  const params = [
    ["secret", p.segredo],
    ["issuer", emissor],
    ["algorithm", "SHA1"],
    ["digits", String(DIGITOS)],
    ["period", String(PERIODO_SEGUNDOS)],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `otpauth://totp/${rotulo}?${params}`;
}

/** Em blocos de 4, do jeito que se dita por telefone e se digita sem errar. */
export function segredoLegivel(segredo: string): string {
  return segredo.replace(/(.{4})/g, "$1 ").trim();
}
