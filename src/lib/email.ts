import { createHash, randomUUID } from "node:crypto";
import { connect as conectarTls, type TLSSocket } from "node:tls";
import { Socket } from "node:net";

/**
 * Envio de e-mail pelo SMTP da casa, sem dependência nova.
 *
 * Este arquivo veio do lojas.avilaops.com (`src/lib/email.ts` de lá), onde
 * nasceu em 19/09/2026 e é testado byte a byte. Faz um subconjunto pequeno e
 * estável de SMTP (EHLO, AUTH LOGIN, MAIL/RCPT/DATA); a parte que erra — montar
 * a mensagem — é pura. O corpo sempre sai em base64: sem linha longa, sem ponto
 * no começo de linha, sem acento quebrado.
 *
 * No auth ele existe para o cadastro próprio (`lib/cadastroProprio.ts`). Sem as
 * variáveis `SMTP_*` e `EMAIL_REMETENTE`, `emailConfigurado()` devolve falso e
 * a tela de criar conta não é oferecida.
 */

export interface EmailParaEnviar {
  /** Um destinatário por mensagem: e-mail em lote é lista de envios, não um envio com lista. */
  para: string;
  assunto: string;
  /** Corpo em texto puro. Obrigatório — cliente que não lê HTML tem que receber algo. */
  texto: string;
  html?: string;
  /** Endereço do remetente. Sem ele vale `EMAIL_REMETENTE`. */
  de?: string | null;
  /** Nome que aparece antes do endereço (o nome da loja, normalmente). */
  nomeDe?: string | null;
  /** Para onde a resposta do comprador vai — o e-mail do lojista. */
  responderPara?: string | null;
}

export interface ConfiguracaoSmtp {
  host: string;
  porta: number;
  usuario: string;
  senha: string;
  /** TLS desde o primeiro byte (porta 465). Fora disso, STARTTLS depois do EHLO. */
  tlsDireto: boolean;
  remetente: string;
  remetenteNome: string;
}

export function lerConfiguracaoSmtp(): ConfiguracaoSmtp | null {
  const host = (process.env.SMTP_HOST ?? "").trim();
  const usuario = (process.env.SMTP_USUARIO ?? "").trim();
  const senha = process.env.SMTP_SENHA ?? "";
  const remetente = (process.env.EMAIL_REMETENTE ?? "").trim();
  if (!host || !usuario || !senha || !remetente) return null;
  const porta = Number(process.env.SMTP_PORTA ?? 465);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) return null;
  return {
    host,
    porta,
    usuario,
    senha,
    tlsDireto: (process.env.SMTP_TLS_DIRETO ?? (porta === 465 ? "1" : "0")) !== "0",
    remetente,
    remetenteNome: (process.env.EMAIL_REMETENTE_NOME ?? "Avila Ops").trim(),
  };
}

/**
 * Envio pelo n8n, para quando este ambiente não tem SMTP próprio.
 *
 * O n8n já guarda a credencial de SMTP da casa e o auth já fala com ele para
 * criar caixa de e-mail (`lib/caixaN8n.ts`), com um token no `.env`. O fluxo
 * "Auth - Enviar e-mail" atende em `auth-enviar-email`, ao lado do
 * `auth-criar-caixa`, com o mesmo token: nenhuma senha de e-mail precisa
 * morar aqui. `N8N_EMAIL_WEBHOOK_URL` só existe para apontar outro endereço.
 */
export function lerReleDeEmail(env: Record<string, string | undefined> = process.env): { url: string; token: string } | null {
  const token = (env.N8N_CAIXA_WEBHOOK_TOKEN ?? "").trim();
  if (!token) return null;
  const explicito = (env.N8N_EMAIL_WEBHOOK_URL ?? "").trim();
  const vizinho = (env.N8N_CAIXA_WEBHOOK_URL ?? "").trim();
  try {
    const url = explicito ? new URL(explicito) : vizinho ? new URL("auth-enviar-email", vizinho) : null;
    // O token viaja no cabeçalho: só por https.
    return url && url.protocol === "https:" ? { url: url.toString(), token } : null;
  } catch {
    return null;
  }
}

/** A plataforma consegue mandar e-mail neste ambiente? */
export function emailConfigurado(): boolean {
  return lerConfiguracaoSmtp() !== null || lerReleDeEmail() !== null;
}

// --- Montagem da mensagem (pura) -------------------------------------------

/**
 * Cabeçalho não aceita quebra de linha, ponto final.
 *
 * O assunto sai de dado do lojista (nome da loja, nome do produto). Um `\r\n`
 * ali acrescentaria cabeçalhos à mensagem — `Bcc:` para quem o atacante
 * quisesse. Não é escapar: é remover, porque cabeçalho de verdade não tem.
 */
function umaLinha(valor: string): string {
  return valor.replace(/[\r\n\u2028\u2029]+/g, " ").trim();
}

const SO_ASCII_IMPRIMIVEL = /^[\x20-\x7E]*$/;

/** RFC 2047: acento em cabeçalho vai em base64, senão chega como "PadÃ¡ria". */
export function codificarCabecalho(valor: string): string {
  const limpo = umaLinha(valor);
  if (SO_ASCII_IMPRIMIVEL.test(limpo)) return limpo;
  return `=?UTF-8?B?${Buffer.from(limpo, "utf8").toString("base64")}?=`;
}

/** `Nome <a@b>` — o endereço cru, o nome codificado. */
export function enderecoComNome(endereco: string, nome?: string | null): string {
  const limpo = umaLinha(endereco);
  if (!nome) return limpo;
  return `${codificarCabecalho(nome)} <${limpo}>`;
}

/**
 * Endereço aceitável para RCPT TO.
 *
 * Deliberadamente simples: um arroba, sem espaço, sem quebra de linha, com
 * ponto no domínio. Validar e-mail por regex completa é folclore; o que
 * importa aqui é não deixar passar o que quebraria o protocolo.
 */
export function enderecoValido(valor: string | null | undefined): valor is string {
  if (typeof valor !== "string") return false;
  const v = valor.trim();
  return v.length >= 6 && v.length <= 254 && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(v);
}

function base64EmLinhas(texto: string): string {
  const b64 = Buffer.from(texto, "utf8").toString("base64");
  return (b64.match(/.{1,76}/g) ?? []).join("\r\n");
}

/**
 * A mensagem inteira, pronta para o DATA.
 *
 * `agora` e `id` entram por parâmetro para o teste poder comparar byte a byte.
 */
export function montarMensagem(
  email: EmailParaEnviar,
  config: { remetente: string; remetenteNome: string },
  agora: Date = new Date(),
  id: string = randomUUID(),
): string {
  const de = email.de?.trim() || config.remetente;
  const nomeDe = email.nomeDe ?? config.remetenteNome;
  const dominio = de.split("@")[1] ?? "lojas.avilaops.com";
  const cabecalhos: string[] = [
    `From: ${enderecoComNome(de, nomeDe)}`,
    `To: ${umaLinha(email.para)}`,
    `Subject: ${codificarCabecalho(email.assunto)}`,
    `Date: ${agora.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${id}@${umaLinha(dominio)}>`,
    "MIME-Version: 1.0",
  ];
  if (email.responderPara && enderecoValido(email.responderPara)) {
    cabecalhos.push(`Reply-To: ${umaLinha(email.responderPara)}`);
  }
  // Mensagem automática: sem isto, resposta automática de férias volta para a
  // caixa da plataforma e vira laço com o próximo aviso.
  cabecalhos.push("Auto-Submitted: auto-generated");

  if (!email.html) {
    cabecalhos.push('Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64");
    return `${cabecalhos.join("\r\n")}\r\n\r\n${base64EmLinhas(email.texto)}\r\n`;
  }

  // Fronteira derivada do id: a mesma mensagem dá a mesma fronteira, e duas
  // mensagens nunca colidem.
  const fronteira = `=_${createHash("sha256").update(id).digest("hex").slice(0, 24)}`;
  cabecalhos.push(`Content-Type: multipart/alternative; boundary="${fronteira}"`);
  const partes = [
    `--${fronteira}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64EmLinhas(email.texto),
    `--${fronteira}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64EmLinhas(email.html),
    `--${fronteira}--`,
    "",
  ];
  return `${cabecalhos.join("\r\n")}\r\n\r\n${partes.join("\r\n")}`;
}

// --- Conversa SMTP ---------------------------------------------------------

export class FalhaDeEnvio extends Error {}

const TEMPO_LIMITE_MS = 20_000;

/** Uma conversa SMTP, linha a linha, com o servidor. */
class Conversa {
  private acumulado = "";
  /**
   * Respostas completas que chegaram antes de alguém pedir.
   *
   * Sem esta fila, uma resposta que chegasse entre o `connect` e o primeiro
   * `esperar()` seria jogada fora, e o envio ficaria pendurado até o tempo
   * limite. Na ordem de eventos do Node isso não acontece hoje, mas depender
   * de microtarefa vir antes de E/S é o tipo de coisa que quebra num upgrade
   * e aparece como "o e-mail às vezes não sai".
   */
  private recebidas: string[] = [];
  private aguardando: ((resposta: string) => void) | null = null;
  private erro: Error | null = null;

  // Atribuição explícita, sem "parameter property": os testes deste projeto
  // rodam com o Node tirando os tipos, e essa sintaxe ele não aceita.
  private socket: Socket | TLSSocket;

  constructor(socket: Socket | TLSSocket) {
    this.socket = socket;
    this.escutar(socket);
  }

  private escutar(socket: Socket | TLSSocket) {
    socket.setEncoding("utf8");
    socket.setTimeout(TEMPO_LIMITE_MS);
    socket.on("data", (pedaco: string) => this.receber(pedaco));
    socket.on("error", (e) => this.falhar(e));
    socket.on("timeout", () => this.falhar(new FalhaDeEnvio("SMTP não respondeu a tempo")));
  }

  private receber(pedaco: string) {
    this.acumulado += pedaco;
    // Resposta completa: a última linha tem espaço depois do código (250 x),
    // não hífen (250-x), que é continuação.
    const linhas = this.acumulado.split("\r\n").filter(Boolean);
    const ultima = linhas[linhas.length - 1];
    if (!ultima || !/^\d{3} /.test(ultima)) return;
    const resposta = this.acumulado;
    this.acumulado = "";
    const espera = this.aguardando;
    this.aguardando = null;
    if (espera) espera(resposta);
    else this.recebidas.push(resposta);
  }

  private falhar(e: Error) {
    this.erro = e;
    const espera = this.aguardando;
    this.aguardando = null;
    espera?.("");
  }

  trocarSocket(socket: TLSSocket) {
    // Todos os ouvintes, não só o de dados: o socket de baixo continua vivo
    // debaixo do TLS, e um `error` dele rejeitaria a espera do socket novo.
    this.socket.removeAllListeners("data");
    this.socket.removeAllListeners("error");
    this.socket.removeAllListeners("timeout");
    this.socket = socket;
    this.escutar(socket);
  }

  esperar(): Promise<string> {
    if (this.erro) return Promise.reject(this.erro);
    const guardada = this.recebidas.shift();
    if (guardada !== undefined) return Promise.resolve(guardada);
    return new Promise((resolve, reject) => {
      this.aguardando = (resposta) => (this.erro ? reject(this.erro) : resolve(resposta));
    });
  }

  async dizer(linha: string, esperado: number): Promise<string> {
    if (this.erro) throw this.erro;
    this.socket.write(`${linha}\r\n`);
    const resposta = await this.esperar();
    conferir(resposta, esperado, linha);
    return resposta;
  }

  escrever(bruto: string) {
    this.socket.write(bruto);
  }

  fechar() {
    this.socket.destroy();
  }
}

/**
 * O comando sai do log; a resposta do servidor, não.
 *
 * `AUTH LOGIN` leva usuário e senha em base64 na própria linha. Num erro de
 * autenticação — justamente quando alguém vai ler o log — a senha iria junto.
 */
function conferir(resposta: string, esperado: number, comando: string) {
  const codigo = Number(resposta.slice(0, 3));
  if (codigo === esperado) return;
  const seguro = /^AUTH|^[A-Za-z0-9+/=]{8,}$/.test(comando) ? "<credencial>" : comando.split(" ")[0];
  throw new FalhaDeEnvio(`SMTP recusou ${seguro}: ${umaLinha(resposta).slice(0, 200)}`);
}

function b64(texto: string): string {
  return Buffer.from(texto, "utf8").toString("base64");
}

/**
 * Manda a mensagem. Devolve o Message-ID; lança `FalhaDeEnvio` se não foi.
 *
 * Nunca engole erro: quem chama é o consumidor de eventos, e evento que
 * "processou" sem o e-mail ter saído é pior que evento falhado — some da fila
 * e ninguém procura.
 */
export async function enviarEmail(email: EmailParaEnviar): Promise<{ messageId: string }> {
  if (!enderecoValido(email.para)) throw new FalhaDeEnvio(`destinatário inválido: ${umaLinha(email.para).slice(0, 80)}`);
  const config = lerConfiguracaoSmtp();
  if (!config) {
    const rele = lerReleDeEmail();
    if (!rele) throw new FalhaDeEnvio("envio de e-mail não configurado neste ambiente");
    return enviarPeloN8n(rele, email);
  }

  const id = randomUUID();
  const mensagem = montarMensagem(email, config, new Date(), id);
  const remetente = email.de?.trim() || config.remetente;

  const socket = config.tlsDireto
    ? conectarTls({ host: config.host, port: config.porta, servername: config.host })
    : new Socket().connect(config.porta, config.host);

  const conversa = new Conversa(socket);
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once(config.tlsDireto ? "secureConnect" : "connect", () => resolve());
      socket.once("error", reject);
    });
    conferir(await conversa.esperar(), 220, "conexão");
    const saudacao = await conversa.dizer(`EHLO ${hostLocal()}`, 250);

    if (!config.tlsDireto) {
      // Senha em rede sem TLS não acontece: sem STARTTLS, o envio para aqui.
      if (!/STARTTLS/i.test(saudacao)) throw new FalhaDeEnvio("servidor SMTP sem STARTTLS e sem TLS direto");
      await conversa.dizer("STARTTLS", 220);
      const seguro = conectarTls({ socket, servername: config.host });
      await new Promise<void>((resolve, reject) => {
        seguro.once("secureConnect", () => resolve());
        seguro.once("error", reject);
      });
      conversa.trocarSocket(seguro);
      await conversa.dizer(`EHLO ${hostLocal()}`, 250);
    }

    await conversa.dizer("AUTH LOGIN", 334);
    await conversa.dizer(b64(config.usuario), 334);
    await conversa.dizer(b64(config.senha), 235);
    await conversa.dizer(`MAIL FROM:<${remetente}>`, 250);
    await conversa.dizer(`RCPT TO:<${email.para.trim()}>`, 250);
    await conversa.dizer("DATA", 354);
    conversa.escrever(mensagem.endsWith("\r\n") ? mensagem : `${mensagem}\r\n`);
    conversa.escrever(".\r\n");
    conferir(await conversa.esperar(), 250, "DATA");
    await conversa.dizer("QUIT", 221).catch(() => undefined);
    return { messageId: id };
  } finally {
    conversa.fechar();
  }
}

/**
 * Entrega a mensagem ao fluxo do n8n, que a envia pelo SMTP dele. O fluxo
 * responde `{ ok, messageId }` ou `{ ok: false, erro }` na mesma requisição.
 */
export async function enviarPeloN8n(rele: { url: string; token: string }, email: EmailParaEnviar, buscar: typeof fetch = fetch): Promise<{ messageId: string }> {
  let resposta: Response;
  try {
    resposta = await buscar(rele.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-avila-webhook-token": rele.token },
      body: JSON.stringify({ para: email.para.trim(), assunto: umaLinha(email.assunto), texto: email.texto, html: email.html ?? "", nomeDe: email.nomeDe ?? "" }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    throw new FalhaDeEnvio("o n8n não respondeu ao pedido de envio");
  }
  const dados = (await resposta.json().catch(() => null)) as { ok?: unknown; messageId?: unknown; erro?: unknown } | null;
  if (!resposta.ok || dados?.ok !== true) {
    throw new FalhaDeEnvio(typeof dados?.erro === "string" ? umaLinha(dados.erro).slice(0, 200) : `o n8n respondeu ${resposta.status}`);
  }
  return { messageId: typeof dados.messageId === "string" ? dados.messageId : randomUUID() };
}

/** O nome que a plataforma dá de si no EHLO. Não é o domínio da loja. */
function hostLocal(): string {
  return (process.env.SMTP_EHLO ?? "auth.avilaops.com").trim() || "auth.avilaops.com";
}
