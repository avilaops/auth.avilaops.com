import assert from "node:assert/strict";
import { test } from "node:test";
import { codificarCabecalho, enderecoComNome, enderecoValido, montarMensagem } from "@/lib/email";

const CONFIG = { remetente: "lojas@avilaops.com", remetenteNome: "Avila Ops" };
const AGORA = new Date("2026-09-19T05:00:00.000Z");
const ID = "11111111-2222-3333-4444-555555555555";

const decodificar = (b64: string) => Buffer.from(b64.replace(/\r\n/g, ""), "base64").toString("utf8");
const corpoDe = (msg: string) => msg.split("\r\n\r\n").slice(1).join("\r\n\r\n");

test("acento em cabeçalho vai codificado, ASCII vai cru", () => {
  assert.equal(codificarCabecalho("Pedido 1042 enviado"), "Pedido 1042 enviado");
  // Sem isto a caixa de entrada mostra "PadÃ¡ria".
  assert.equal(codificarCabecalho("Padaria"), "Padaria");
  assert.equal(codificarCabecalho("Emissão"), "=?UTF-8?B?RW1pc3PDo28=?=");
});

test("quebra de linha em cabeçalho é removida, não escapada", () => {
  // Injeção de cabeçalho: o nome da loja e o do produto são dados do lojista.
  const perigoso = "Pedido\r\nBcc: espiao@exemplo.com";
  assert.equal(codificarCabecalho(perigoso), "Pedido Bcc: espiao@exemplo.com");
  const msg = montarMensagem({ para: "a@b.com", assunto: perigoso, texto: "oi" }, CONFIG, AGORA, ID);
  const cabecalhos = msg.split("\r\n\r\n")[0];
  assert.equal(cabecalhos.split("\r\n").filter((l) => /^Bcc:/i.test(l)).length, 0);
});

test("o nome do remetente também não injeta cabeçalho", () => {
  const msg = montarMensagem(
    { para: "a@b.com", assunto: "oi", texto: "oi", nomeDe: "Loja\r\nBcc: x@y.com" },
    CONFIG,
    AGORA,
    ID,
  );
  assert.equal(msg.split("\r\n\r\n")[0].split("\r\n").filter((l) => /^Bcc:/i.test(l)).length, 0);
});

test("endereço com nome: o nome codifica, o endereço não", () => {
  assert.equal(enderecoComNome("a@b.com"), "a@b.com");
  assert.equal(enderecoComNome("a@b.com", "Farmácia"), "=?UTF-8?B?RmFybcOhY2lh?= <a@b.com>");
});

test("endereço válido é o que não quebra o protocolo", () => {
  assert.equal(enderecoValido("comprador@exemplo.com"), true);
  assert.equal(enderecoValido("a@b"), false, "domínio sem ponto");
  assert.equal(enderecoValido("a b@c.com"), false, "espaço");
  assert.equal(enderecoValido("a@c.com\r\nRCPT TO:<outro@x.com>"), false, "quebra de linha");
  assert.equal(enderecoValido(""), false);
  assert.equal(enderecoValido(null), false);
  assert.equal(enderecoValido(undefined), false);
});

test("mensagem só texto: base64, UTF-8, e o acento volta inteiro", () => {
  const msg = montarMensagem({ para: "a@b.com", assunto: "Olá", texto: "Olá, José!\nTudo certo." }, CONFIG, AGORA, ID);
  assert.match(msg, /^Content-Type: text\/plain; charset="UTF-8"$/m);
  assert.match(msg, /^Content-Transfer-Encoding: base64$/m);
  assert.equal(decodificar(corpoDe(msg)), "Olá, José!\nTudo certo.");
});

test("linha começando com ponto sobrevive — é o que o base64 resolve", () => {
  // Em SMTP, uma linha "." no corpo encerra a mensagem. Em base64 não existe
  // ponto, então não há o que confundir.
  const texto = ".\n.linha\n..duas";
  const msg = montarMensagem({ para: "a@b.com", assunto: "x", texto }, CONFIG, AGORA, ID);
  assert.ok(!corpoDe(msg).includes("."), "o corpo codificado não pode ter ponto");
  assert.equal(decodificar(corpoDe(msg)), texto);
});

test("linha do corpo nunca passa de 76 caracteres", () => {
  // Servidor SMTP pode recusar linha acima de 998 octetos; 76 é o limite do
  // base64 por convenção e mantém a mensagem legível em qualquer cliente.
  const msg = montarMensagem({ para: "a@b.com", assunto: "x", texto: "a".repeat(5000) }, CONFIG, AGORA, ID);
  for (const linha of corpoDe(msg).split("\r\n")) assert.ok(linha.length <= 76, `linha de ${linha.length}`);
});

test("com HTML vira multipart/alternative, e as duas partes batem", () => {
  const msg = montarMensagem(
    { para: "a@b.com", assunto: "x", texto: "Olá", html: "<p>Olá</p>" },
    CONFIG,
    AGORA,
    ID,
  );
  const fronteira = msg.match(/boundary="([^"]+)"/)?.[1];
  assert.ok(fronteira, "sem fronteira");
  const partes = corpoDe(msg).split(`--${fronteira}`);
  assert.equal(partes[partes.length - 1].trim(), "--", "faltou a fronteira de encerramento");
  const conteudos = partes
    .filter((p) => p.includes("base64"))
    .map((p) => decodificar(p.split("\r\n\r\n")[1]));
  assert.deepEqual(conteudos, ["Olá", "<p>Olá</p>"]);
});

test("a mesma mensagem dá a mesma fronteira, e duas nunca colidem", () => {
  const um = montarMensagem({ para: "a@b.com", assunto: "x", texto: "t", html: "<p>t</p>" }, CONFIG, AGORA, ID);
  const dois = montarMensagem({ para: "a@b.com", assunto: "x", texto: "t", html: "<p>t</p>" }, CONFIG, AGORA, ID);
  assert.equal(um, dois);
  const outro = montarMensagem(
    { para: "a@b.com", assunto: "x", texto: "t", html: "<p>t</p>" },
    CONFIG,
    AGORA,
    "99999999-2222-3333-4444-555555555555",
  );
  assert.notEqual(um.match(/boundary="([^"]+)"/)?.[1], outro.match(/boundary="([^"]+)"/)?.[1]);
});

test("Reply-To só entra com endereço que presta", () => {
  const bom = montarMensagem(
    { para: "a@b.com", assunto: "x", texto: "t", responderPara: "lojista@loja.com" },
    CONFIG,
    AGORA,
    ID,
  );
  assert.match(bom, /^Reply-To: lojista@loja\.com$/m);
  const ruim = montarMensagem({ para: "a@b.com", assunto: "x", texto: "t", responderPara: "nao-e-email" }, CONFIG, AGORA, ID);
  assert.ok(!/^Reply-To:/m.test(ruim));
});

test("toda mensagem se declara automática", () => {
  // Sem isto, a resposta automática de férias do comprador volta para a caixa
  // da plataforma e vira laço com o próximo aviso do mesmo pedido.
  const msg = montarMensagem({ para: "a@b.com", assunto: "x", texto: "t" }, CONFIG, AGORA, ID);
  assert.match(msg, /^Auto-Submitted: auto-generated$/m);
});

test("o Message-ID usa o domínio do remetente de verdade", () => {
  const msg = montarMensagem({ para: "a@b.com", assunto: "x", texto: "t", de: "pedidos@padaria.com.br" }, CONFIG, AGORA, ID);
  assert.match(msg, new RegExp(`^Message-ID: <${ID}@padaria\\.com\\.br>$`, "m"));
  assert.match(msg, /^From: Avila Ops <pedidos@padaria\.com\.br>$/m);
});
