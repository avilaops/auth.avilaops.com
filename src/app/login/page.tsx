import Link from "next/link";
import { redirect } from "next/navigation";
import { destinoInicial } from "@/lib/admin";
import { returnToSeguro } from "@/lib/apps";
import { buscarApp } from "@/lib/cadastro";
import { conectoresLigados } from "@/lib/conectores";
import { emailConfigurado } from "@/lib/email";
import { podeEntrar } from "@/lib/permissoes";
import { desafioNecessario } from "@/lib/segundoFator";
import { lerSessao } from "@/lib/sessao";
import Marca from "@/components/Marca";
import BotoesSociais from "./BotoesSociais";
import FormLogin from "./FormLogin";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ app?: string; returnTo?: string }>;
};

/**
 * Tela única de acesso: senha (credencial de `portal_clients`) e os conectores
 * de login que estiverem ligados no painel.
 */
export default async function LoginPage({ searchParams }: Props) {
  const { app: appId, returnTo } = await searchParams;
  const app = await buscarApp(appId);
  const sessao = await lerSessao();

  // Sessão que nasceu antes do segundo fator (o cookie vale 8 horas), ou que
  // veio de um app aberto e agora tenta um app que exige o fator: não é caso
  // de recusar nem de deixar passar. Eleva — pede só a metade que falta e
  // devolve ao destino.
  if (sessao && !sessao.mfa && (await desafioNecessario({ email: sessao.email, papel: sessao.papel, app })) !== "nenhum") {
    const q = new URLSearchParams();
    if (app) q.set("app", app.id);
    if (returnTo) q.set("returnTo", returnTo);
    redirect(`/api/auth/mfa/elevar${q.size ? `?${q}` : ""}`);
  }

  // Já logado e com destino válido: não faz sentido mostrar a tela de novo.
  // É este atalho que dá a sensação de SSO — o segundo app não pede nada.
  //
  // Passa por `podeEntrar`, como o login com senha. Isto conferia só o papel
  // exigido, e por isso app restrito não restringia quem já chegava logado:
  // um cliente com sessão aberta em outro sistema era mandado direto para
  // dentro, sem nunca ter sido liberado. Sem permissão, a tela aparece — é a
  // chance de entrar com outra conta.
  if (app && sessao && (await podeEntrar(sessao.email, sessao.papel, app))) {
    redirect(returnToSeguro(returnTo, app));
  }
  // Validado aqui, no servidor, antes de chegar ao formulário. Sem app, só
  // caminho interno (ex.: /admin, /oauth/authorize).
  const destinoSeguro = app
    ? returnTo
      ? returnToSeguro(returnTo, app)
      : null
    : returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : null;

  // Já logado e sem app: honrar o destino interno antes do padrão. É o que faz
  // o fluxo OIDC sobreviver a quem cai aqui com sessão viva — sem isto o
  // `/oauth/authorize` era trocado por `/admin` e o app de terceiro ficava
  // esperando um retorno que nunca vinha.
  if (!app && sessao) redirect(destinoSeguro ?? destinoInicial(sessao));

  const sociais = await conectoresLigados();
  // O cadastro leva junto o destino cru: quem o valida é esta tela, na volta.
  const paraCriar = new URLSearchParams();
  if (app) paraCriar.set("app", app.id);
  if (returnTo) paraCriar.set("returnTo", returnTo);
  const podeCriar = emailConfigurado() || sociais.length > 0;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Marca tamanho={48} className="mx-auto mb-5" />
          <h1 className="text-xl font-semibold tracking-tight">Ávila Ops</h1>
          <p className="mt-1.5 text-sm text-[var(--color-texto-fraco)]">
            {app ? `Entrar em ${app.nome}` : "Acesso"}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6 shadow-[var(--sombra-1)]">
          <FormLogin app={app?.id ?? null} returnTo={destinoSeguro} />

          {sociais.length > 0 && (
            <>
              <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wide text-[var(--color-texto-fraco)]">
                <span className="h-px flex-1 bg-[var(--color-borda)]" />
                ou
                <span className="h-px flex-1 bg-[var(--color-borda)]" />
              </div>
              <BotoesSociais provedores={sociais} app={app?.id ?? null} returnTo={destinoSeguro} />
            </>
          )}
        </div>

        {podeCriar && (
          <p className="mt-5 text-center text-sm">
            Ainda não tem conta?{" "}
            <Link href={`/criar${paraCriar.size ? `?${paraCriar}` : ""}`} className="inline-flex min-h-11 items-center font-medium text-[var(--color-marca)] hover:underline">
              Criar conta
            </Link>
          </p>
        )}

        <p className="mt-3 text-center text-xs leading-relaxed text-[var(--color-texto-fraco)]">
          Esqueceu a senha? Fale com a equipe Avila Ops — enviamos um link de recuperação.
        </p>
      </div>
    </main>
  );
}
