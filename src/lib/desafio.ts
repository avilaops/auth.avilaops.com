import { createHmac } from "crypto";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import type { Papel } from "@/lib/apps";

/**
 * Estado entre "a senha está certa" e "a sessão existe".
 *
 * Quem passou pela senha (ou pelo login social) mas ainda deve o segundo fator
 * não pode receber o cookie de sessão — ele vale em todo `*.avilaops.com` e
 * abriria os apps antes da segunda prova. Fica então este bilhete curto,
 * guardado em cookie próprio, que só serve para terminar o login.
 *
 * ## Por que não é assinado com o mesmo segredo da sessão
 *
 * Seria o mesmo token. Assinado com `SSO_JWT_SECRET` e emissor
 * `auth.avilaops.com`, quem copiasse o valor do cookie de desafio para o
 * cookie `avila_sso` teria uma sessão válida — o segundo fator viraria enfeite,
 * contornável pelo próprio dono do navegador. Por isso o bilhete é assinado
 * com uma chave **derivada** do segredo (HMAC com rótulo fixo) e carrega
 * emissor próprio: `verificarSessao` recusa, e todo app que confere o emissor
 * recusa junto, sem precisar saber que isto existe.
 */

const COOKIE_DESAFIO = "avila_sso_desafio";
const EMISSOR = "auth.avilaops.com/desafio";

/**
 * 10 minutos: o cadastro do fator exige abrir o aplicativo, ler o QR e guardar
 * os códigos de recuperação. Menos que isso expira gente de boa fé no meio.
 */
const TTL_SEGUNDOS = 10 * 60;

export type MotivoDesafio = "verificar" | "cadastrar";

export type Desafio = {
  sub: string;
  email: string;
  nome: string;
  foto: string | null;
  papel: Papel;
  /** O que falta: digitar o código ou cadastrar o fator agora. */
  motivo: MotivoDesafio;
  /** Destino já validado no passo anterior (host do app ou caminho interno). */
  destino: string;
  /** App do registro, só para a auditoria. */
  appId: string | null;
  /** Como a pessoa chegou aqui — vai para o detalhe do evento. */
  via: string;
  /** Senha provisória pendente: manda para `/trocar-senha` depois do fator. */
  senhaProvisoria: boolean;
  /** App nativo: a sessão sai por código de uso único, não por cookie. */
  deepLink: string | null;
};

function segredo(): string {
  const base = process.env.SSO_JWT_SECRET;
  if (!base) throw new Error("SSO_JWT_SECRET não configurado");
  return createHmac("sha256", base).update("desafio-segundo-fator-v1").digest("hex");
}

export function assinarDesafio(d: Desafio): string {
  return jwt.sign(d, segredo(), { expiresIn: TTL_SEGUNDOS, issuer: EMISSOR });
}

export function verificarDesafio(token: string): Desafio | null {
  try {
    const dados = jwt.verify(token, segredo(), { issuer: EMISSOR }) as Desafio;
    return dados.sub && dados.email ? dados : null;
  } catch {
    return null;
  }
}

/**
 * Cookie sem `domain`: ao contrário da sessão, este bilhete não tem nada que
 * fazer nos outros subdomínios — quem o consome é só o `auth`.
 */
export async function gravarCookieDesafio(d: Desafio): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_DESAFIO, assinarDesafio(d), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SEGUNDOS,
  });
}

export async function lerDesafio(): Promise<Desafio | null> {
  const store = await cookies();
  const token = store.get(COOKIE_DESAFIO)?.value;
  if (!token) return null;
  return verificarDesafio(token);
}

export async function limparCookieDesafio(): Promise<void> {
  const store = await cookies();
  store.delete({ name: COOKIE_DESAFIO, path: "/" });
}

export const NOME_COOKIE_DESAFIO = COOKIE_DESAFIO;
