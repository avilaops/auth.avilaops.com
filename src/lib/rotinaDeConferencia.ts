import type { Cadastro } from "@/lib/apps";
import { listarCadastro } from "@/lib/cadastro";
import { avisosDaRodada, conferirVencidas, lerConferencias, VALIDADE_MS, type Aviso, type Conferencia } from "@/lib/conferencia";
import { emailConfigurado, enviarEmail } from "@/lib/email";

/**
 * Conferência das aplicações sem depender de alguém abrir o painel.
 *
 * A conferência só rodava quando `/admin/apps` era aberta. Aqui ela roda de
 * tempo em tempo dentro do próprio processo (ligada em `instrumentation.ts`),
 * sem cron nem serviço de fora para manter, e avisa por e-mail quando uma
 * aplicação cadastrada como no ar para de responder ou volta.
 *
 * Quem recebe é quem abre o painel: os endereços de `SSO_SUPERADMINS`. Sem a
 * variável, ou sem envio de e-mail configurado, a rotina continua conferindo e
 * o resultado fica só no painel.
 */

export function destinatariosDoAviso(env: Record<string, string | undefined> = process.env): string[] {
  return (env.SSO_SUPERADMINS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Assunto e corpo de um aviso. Um e-mail por rodada, com tudo que mudou nela. */
export function mensagemDoAviso(avisos: Aviso[]): { assunto: string; texto: string } {
  const pararam = avisos.filter((a) => a.tipo === "parou");
  const voltaram = avisos.filter((a) => a.tipo === "voltou");
  const assunto =
    pararam.length === 1 && voltaram.length === 0 ? `${pararam[0].host} parou de responder`
    : pararam.length === 0 && voltaram.length === 1 ? `${voltaram[0].host} voltou a responder`
    : pararam.length > 0 ? `${pararam.length} aplicações pararam de responder`
    : `${voltaram.length} aplicações voltaram a responder`;
  const linhas = [
    ...(pararam.length > 0 ? ["Pararam de responder:", ...pararam.map((a) => `- ${a.host}: ${a.detalhe}`), ""] : []),
    ...(voltaram.length > 0 ? ["Voltaram a responder:", ...voltaram.map((a) => `- ${a.host}`), ""] : []),
    "O cadastro informa estas aplicações como no ar. A conferência pede a página inicial de cada uma a cada 10 minutos, e repete uma vez antes de dar como sem resposta.",
    "Painel: https://auth.avilaops.com/admin/apps?f_conferencia=nao_responde",
  ];
  return { assunto, texto: linhas.join("\n") };
}

/** Confere o que venceu e avisa o que mudou. Nunca lança. */
export async function conferirEAvisar(cadastro: Pick<Cadastro, "id" | "host" | "situacao">[], conhecidas: Map<string, Conferencia>): Promise<void> {
  try {
    const avisos = avisosDaRodada(await conferirVencidas(cadastro, conhecidas));
    if (avisos.length === 0) return;
    const para = destinatariosDoAviso();
    if (para.length === 0 || !emailConfigurado()) {
      console.warn("[conferencia] mudança sem aviso por e-mail (sem destinatário ou sem envio configurado):", avisos.map((a) => `${a.host} ${a.tipo}`).join(", "));
      return;
    }
    const { assunto, texto } = mensagemDoAviso(avisos);
    for (const endereco of para) await enviarEmail({ para: endereco, assunto, texto });
  } catch (e) {
    console.error("[conferencia] aviso não enviado", e instanceof Error ? e.message : e);
  }
}

const ligada = globalThis as unknown as { rotinaDeConferencia?: boolean };

/** Liga a rotina, uma vez por processo. A primeira rodada espera o servidor assentar. */
export function iniciarRotinaDeConferencia(): void {
  if (ligada.rotinaDeConferencia) return;
  ligada.rotinaDeConferencia = true;
  const rodar = async () => {
    try {
      await conferirEAvisar(await listarCadastro(), await lerConferencias());
    } catch (e) {
      console.error("[conferencia] rodada da rotina falhou", e instanceof Error ? e.message : e);
    }
  };
  setTimeout(rodar, 60_000).unref();
  setInterval(rodar, VALIDADE_MS).unref();
}
