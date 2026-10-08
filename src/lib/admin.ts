import { redirect } from "next/navigation";
import { desafioNecessario } from "@/lib/segundoFator";
import { lerSessao, type Sessao } from "@/lib/sessao";

/**
 * Quem pode abrir o painel.
 *
 * Por padrão, qualquer ADMIN (equipe). Se `SSO_SUPERADMINS` estiver definido
 * (e-mails separados por vírgula), só eles — para o dia em que a equipe
 * crescer e nem todo mundo dever ver todas as contas.
 */
export function ehSuperadmin(sessao: Sessao | null): sessao is Sessao {
  return podeAbrirPainel(sessao);
}

function podeAbrirPainel(sessao: Pick<Sessao, "email" | "papel"> | null): boolean {
  if (!sessao || sessao.papel !== "ADMIN") return false;
  const lista = (process.env.SSO_SUPERADMINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return lista.length === 0 || lista.includes(sessao.email.toLowerCase());
}

/**
 * Para onde vai quem entrou sem destino: o painel, se puder abrir; senão a
 * própria conta.
 *
 * Decidir só pelo papel ADMIN mandava o sócio (SOCIO vira ADMIN, mas não está
 * em `SSO_SUPERADMINS`) para `/admin`, que o devolvia ao `/login`, que com
 * sessão viva o mandava de novo ao `/admin`: ERR_TOO_MANY_REDIRECTS.
 */
export function destinoInicial(sessao: Pick<Sessao, "email" | "papel">): string {
  return podeAbrirPainel(sessao) ? "/admin" : "/conta";
}

/**
 * Em página: sem sessão vai ao login; com sessão mas sem permissão, à conta.
 *
 * O segundo fator é conferido aqui também, e não só no `/login`: o painel é a
 * tela que cria contas, define senhas e liga conectores. Sessão aberta antes
 * de o 2FA existir chegaria direto nele pela URL, sem passar pelo login. Aqui
 * ela é elevada — pede o código e volta.
 */
export async function exigirAdmin(caminho = "/admin"): Promise<Sessao> {
  const sessao = await lerSessao();
  if (!sessao) redirect(`/login?returnTo=${encodeURIComponent(caminho)}`);
  // Mandar ao login quem já está logado fecha o laço login → /admin → login.
  if (!ehSuperadmin(sessao)) redirect("/conta");
  if (!sessao.mfa && (await desafioNecessario({ email: sessao.email, papel: sessao.papel })) !== "nenhum") {
    redirect(`/api/auth/mfa/elevar?returnTo=${encodeURIComponent(caminho)}`);
  }
  return sessao;
}

/**
 * Em server action: lança, para nunca executar nada sem sessão.
 *
 * O fator vale aqui também. A casca do painel já eleva a sessão ao abrir, mas
 * uma aba aberta antes disso continua com os formulários na tela — e são as
 * actions, não as páginas, que criam conta, definem senha e ligam conector.
 */
export async function exigirAdminAction(): Promise<Sessao> {
  const sessao = await lerSessao();
  if (!ehSuperadmin(sessao)) throw new Error("Sem permissão");
  if (!sessao.mfa && (await desafioNecessario({ email: sessao.email, papel: sessao.papel })) !== "nenhum") {
    throw new Error("Confirme a verificação em duas etapas para continuar (recarregue a página)");
  }
  return sessao;
}
