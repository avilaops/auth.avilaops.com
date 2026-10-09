import { createHmac } from "crypto";
import jwt from "jsonwebtoken";
import { urlAbsoluta } from "@/lib/urls";

/**
 * Cadastro feito pela própria pessoa, a partir da tela de login.
 *
 * Até 09/10/2026 só havia dois jeitos de ter conta: a equipe criar pelo painel,
 * ou a pessoa entrar com Google, Microsoft ou Facebook. Quem chegava do CRM, do
 * ERP ou do Lojas querendo criar conta com e-mail e senha batia numa tela que
 * só oferecia "Entrar".
 *
 * O caminho, em dois passos:
 *
 * 1. `/criar` pede nome e e-mail e manda um link de confirmação.
 * 2. O link abre `/criar/confirmar/<token>`, a pessoa escolhe a senha e a conta
 *    nasce ali, já logada, voltando para o sistema de onde ela veio.
 *
 * **Nada é gravado antes da confirmação.** O link é assinado e carrega o que
 * foi pedido; quem nunca clica não deixa linha em banco nenhum, e ninguém
 * consegue reservar o e-mail de outra pessoa.
 *
 * A conta nasce como equipe do cliente (`CLIENT`), sem empresa e sem liberação
 * nenhuma. Ter conta não dá acesso a aplicação restrita nem a dados de empresa:
 * cada sistema continua decidindo quem entra (ver
 * `docs/PAPEIS-VINCULOS-E-ACESSO.md`).
 */

const VALIDADE_S = 24 * 60 * 60;
const PROPOSITO = "cadastro-proprio";

export type PedidoDeCadastro = {
  email: string;
  nome: string;
  /** Aplicação e destino que estavam na tela de login, para voltar depois. */
  app: string | null;
  returnTo: string | null;
};

/**
 * Chave própria deste link, derivada do segredo da sessão. Um token de
 * cadastro não serve de sessão nem o contrário: a chave é outra, e o propósito
 * é conferido na leitura.
 */
function chave(): string {
  const segredo = process.env.SSO_JWT_SECRET;
  if (!segredo) throw new Error("SSO_JWT_SECRET não configurado");
  return createHmac("sha256", segredo).update(PROPOSITO).digest("hex");
}

export function normalizarEmail(v: string): string {
  return v.trim().toLowerCase();
}

export function emailAceito(v: string): boolean {
  return v.length <= 254 && /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,63}$/i.test(v);
}

export function nomeAceito(v: string): boolean {
  const nome = v.trim();
  return nome.length >= 2 && nome.length <= 120 && !/[<>\r\n]/.test(nome);
}

export function tokenDeCadastro(p: PedidoDeCadastro): string {
  return jwt.sign({ p: PROPOSITO, email: normalizarEmail(p.email), nome: p.nome.trim(), app: p.app, returnTo: p.returnTo }, chave(), {
    algorithm: "HS256",
    expiresIn: VALIDADE_S,
  });
}

export function lerTokenDeCadastro(token: string): PedidoDeCadastro | null {
  try {
    const dados = jwt.verify(token, chave(), { algorithms: ["HS256"] });
    if (typeof dados !== "object" || dados === null) return null;
    const { p, email, nome, app, returnTo } = dados as Record<string, unknown>;
    if (p !== PROPOSITO || typeof email !== "string" || typeof nome !== "string") return null;
    if (!emailAceito(email) || !nomeAceito(nome)) return null;
    return { email, nome, app: typeof app === "string" ? app : null, returnTo: typeof returnTo === "string" ? returnTo : null };
  } catch {
    return null;
  }
}

/**
 * Para onde a pessoa vai depois de confirmar: de volta à tela de login com o
 * mesmo destino de antes. Com a sessão aberta, a tela de login confere a
 * permissão e segue sozinha — é ela que valida o `returnTo`, não este link.
 */
export function destinoDepoisDoCadastro(p: Pick<PedidoDeCadastro, "app" | "returnTo">): string {
  const q = new URLSearchParams();
  if (p.app) q.set("app", p.app);
  if (p.returnTo) q.set("returnTo", p.returnTo);
  return q.size > 0 ? `/login?${q.toString()}` : "/conta";
}

export function linkDeConfirmacao(token: string): string {
  return urlAbsoluta(`/criar/confirmar/${token}`);
}

const escapar = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function moldura(titulo: string, corpo: string, botao: { rotulo: string; link: string }, rodape: string) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td style="font-size:20px;font-weight:bold;padding-bottom:12px">${escapar(titulo)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:24px">${corpo}</td></tr>
<tr><td style="padding-bottom:24px"><a href="${escapar(botao.link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${escapar(botao.rotulo)}</a></td></tr>
<tr><td style="font-size:12px;line-height:1.6;color:#6b7280">${rodape}</td></tr>
</table></td></tr></table></body></html>`;
}

/** E-mail de confirmação, para quem ainda não tem conta. */
export function emailDeConfirmacao(nome: string, link: string) {
  const primeiro = nome.trim().split(/\s+/)[0];
  return {
    assunto: "Confirme seu e-mail para criar a conta Ávila Ops",
    texto: `Olá, ${primeiro}.\n\nPara criar sua conta Ávila Ops, abra o link abaixo e escolha uma senha:\n\n${link}\n\nO link vale por 24 horas. Se você não pediu esta conta, ignore este e-mail: nada foi criado.\n\nÁvila Ops`,
    html: moldura(
      "Confirme seu e-mail",
      `Olá, ${escapar(primeiro)}. Para criar sua conta Ávila Ops, confirme o e-mail e escolha uma senha.`,
      { rotulo: "Confirmar e criar a conta", link },
      "O link vale por 24 horas. Se você não pediu esta conta, ignore este e-mail: nada foi criado.",
    ),
  };
}

/** E-mail para quem pediu cadastro e já tem conta: o link serve para definir uma senha nova. */
export function emailDeContaExistente(link: string) {
  return {
    assunto: "Você já tem conta Ávila Ops",
    texto: `Recebemos um pedido de criação de conta com este e-mail, mas ele já tem conta Ávila Ops.\n\nSe foi você e não lembra a senha, defina uma nova por este link (vale 1 hora):\n\n${link}\n\nSe não foi você, ignore este e-mail: nada mudou.\n\nÁvila Ops`,
    html: moldura(
      "Você já tem conta",
      "Recebemos um pedido de criação de conta com este e-mail, mas ele já tem conta Ávila Ops. Se foi você e não lembra a senha, defina uma nova.",
      { rotulo: "Definir uma senha nova", link },
      "O link vale por 1 hora. Se não foi você, ignore este e-mail: nada mudou.",
    ),
  };
}
