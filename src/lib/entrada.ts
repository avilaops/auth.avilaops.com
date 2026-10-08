import type { AppRegistrado, Papel } from "@/lib/apps";
import { emitirCodigo } from "@/lib/codigoTroca";
import { gravarCookieDesafio, type Desafio, type MotivoDesafio } from "@/lib/desafio";
import { registrar } from "@/lib/eventos";
import { desafioNecessario, mfaDisponivel, politicaExige } from "@/lib/segundoFator";
import { gravarCookieSessao } from "@/lib/sessao";

/**
 * O último passo de todo login, em um lugar só.
 *
 * Senha, login social e link de recuperação chegavam cada um ao seu próprio
 * `gravarCookieSessao`. Com segundo fator no meio isso viraria três cópias da
 * mesma decisão — e a cópia esquecida seria exatamente o caminho que entra sem
 * o fator. Aqui a pergunta "esta pessoa já pode ter sessão?" é feita uma vez,
 * por todos.
 */

export type Candidato = {
  sub: string;
  email: string;
  nome: string;
  foto: string | null;
  papel: Papel;
  /** Destino já validado por quem chamou (host do app ou caminho interno). */
  destino: string;
  app: AppRegistrado | null;
  /** Senha provisória pendente: troca obrigatória depois de entrar. */
  senhaProvisoria: boolean;
  /** Como entrou, para o detalhe do evento ("senha", "via google"…). */
  via: string;
};

export type Entrada =
  | { tipo: "sessao"; destino: string }
  | { tipo: "desafio"; motivo: MotivoDesafio; destino: string };

/**
 * Abre a sessão, ou devolve o desafio de segundo fator que falta.
 *
 * O fator é conferido **antes** de o cookie existir: sessão emitida e depois
 * "completada" seria sessão válida em todo `*.avilaops.com` para quem parasse
 * no meio do caminho.
 */
export async function entrar(c: Candidato, ip: string | null): Promise<Entrada> {
  const motivo = await desafioNecessario({ email: c.email, papel: c.papel, app: c.app });

  // Exigência suspensa por falta de chave de cifra: o login segue (trancar
  // todo mundo para fora seria pior), mas fica o rastro. Controle de segurança
  // que cai em silêncio é controle que ninguém percebe que não existe mais.
  if (!mfaDisponivel() && politicaExige({ papel: c.papel, app: c.app })) {
    await registrar({
      tipo: "mfa_indisponivel",
      email: c.email,
      appId: c.app?.id ?? null,
      ip,
      detalhe: "AUTH_ENCRYPTION_KEY ausente: segundo fator não exigido",
    });
  }

  if (motivo === "nenhum") {
    return { tipo: "sessao", destino: await abrirSessao(c, { ip, mfa: false }) };
  }

  const desafio: Desafio = {
    sub: c.sub,
    email: c.email,
    nome: c.nome,
    foto: c.foto,
    papel: c.papel,
    motivo,
    destino: c.destino,
    appId: c.app?.id ?? null,
    via: c.via,
    senhaProvisoria: c.senhaProvisoria,
    deepLink: c.app?.deepLink ?? null,
  };
  await gravarCookieDesafio(desafio);
  await registrar({
    tipo: motivo === "cadastrar" ? "mfa_cadastro_exigido" : "mfa_desafiado",
    email: c.email,
    appId: c.app?.id ?? null,
    ip,
    detalhe: c.via,
  });

  return { tipo: "desafio", motivo, destino: motivo === "cadastrar" ? "/mfa/cadastrar" : "/mfa" };
}

/**
 * Entrega a sessão e devolve para onde ir.
 *
 * App nativo não recebe cookie (o navegador do sistema não o compartilha com o
 * app): vai um código de uso único no deep link, como antes do 2FA.
 */
export async function abrirSessao(
  c: Pick<Candidato, "sub" | "email" | "nome" | "foto" | "papel" | "destino" | "senhaProvisoria" | "via"> & {
    app?: AppRegistrado | null;
    /** Quem chega pelo desafio traz o id do app, não o registro inteiro. */
    appId?: string | null;
    deepLink?: string | null;
  },
  opcoes: { ip: string | null; mfa: boolean; detalhe?: string },
): Promise<string> {
  const appId = c.appId ?? c.app?.id ?? null;
  const detalhe = [c.via, opcoes.mfa ? "2FA" : null, opcoes.detalhe ?? null].filter(Boolean).join(" · ") || null;
  const deepLink = c.deepLink ?? c.app?.deepLink ?? null;

  if (deepLink) {
    const codigo = await emitirCodigo(c.sub, c.papel);
    await registrar({ tipo: "login_ok", email: c.email, appId, ip: opcoes.ip, detalhe });
    return `${deepLink}?code=${codigo}`;
  }

  await gravarCookieSessao({
    sub: c.sub,
    email: c.email,
    nome: c.nome,
    foto: c.foto,
    papel: c.papel,
    mfa: opcoes.mfa,
  });
  await registrar({ tipo: "login_ok", email: c.email, appId, ip: opcoes.ip, detalhe });

  // Senha provisória: troca obrigatória antes de seguir, com o destino
  // original a reboque para a pessoa cair onde queria.
  return c.senhaProvisoria ? `/trocar-senha?returnTo=${encodeURIComponent(c.destino)}` : c.destino;
}
