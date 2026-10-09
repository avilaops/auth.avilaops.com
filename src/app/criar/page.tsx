import Link from "next/link";
import { redirect } from "next/navigation";
import { returnToSeguro } from "@/lib/apps";
import { buscarApp } from "@/lib/cadastro";
import { conectoresLigados } from "@/lib/conectores";
import { emailConfigurado } from "@/lib/email";
import { lerSessao } from "@/lib/sessao";
import Marca from "@/components/Marca";
import BotoesSociais from "../login/BotoesSociais";
import FormCriar from "./FormCriar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Criar conta" };

type Props = { searchParams: Promise<{ app?: string; returnTo?: string }> };

/**
 * Criar conta Ávila Ops. Quem chega aqui veio da tela de login, quase sempre
 * mandado por um dos sistemas (CRM, ERP, Lojas); `app` e `returnTo` seguem
 * junto para a pessoa voltar para lá depois de confirmar o e-mail.
 */
export default async function CriarContaPage({ searchParams }: Props) {
  const { app: appId, returnTo } = await searchParams;
  const q = new URLSearchParams();
  if (appId) q.set("app", appId);
  if (returnTo) q.set("returnTo", returnTo);
  const login = `/login${q.size ? `?${q}` : ""}`;

  // Quem já está logado não cria conta: volta ao login, que segue para o destino.
  if (await lerSessao()) redirect(login);

  const [app, sociais] = await Promise.all([buscarApp(appId), conectoresLigados()]);
  const porEmail = emailConfigurado();
  // Mesma validação da tela de login: host da aplicação, ou caminho interno.
  const destinoSeguro = app
    ? returnTo ? returnToSeguro(returnTo, app) : null
    : returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Marca tamanho={48} className="mx-auto mb-5" />
          <h1 className="text-xl font-semibold tracking-tight">Criar conta Ávila Ops</h1>
          <p className="mt-1.5 text-sm text-[var(--color-texto-fraco)]">
            {app ? `Uma conta só para ${app.nome} e os outros sistemas da Ávila Ops.` : "Uma conta só para os sistemas da Ávila Ops."}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6 shadow-[var(--sombra-1)]">
          {porEmail ? (
            <FormCriar app={app?.id ?? null} returnTo={returnTo ?? null} />
          ) : (
            <p className="text-sm text-[var(--color-texto-fraco)]">
              A criação de conta por e-mail e senha não está disponível agora.
              {sociais.length > 0 ? " Use uma das opções abaixo: a conta é criada no primeiro acesso." : " Fale com a equipe Ávila Ops para criar a sua."}
            </p>
          )}

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

        <p className="mt-6 text-center text-xs leading-relaxed text-[var(--color-texto-fraco)]">
          Ter conta não libera sozinho todos os sistemas: alguns pedem que a empresa ou a equipe Ávila Ops liberem o acesso.
        </p>
        <p className="mt-3 text-center text-sm">
          <Link href={login} className="inline-flex min-h-11 items-center text-[var(--color-marca)] hover:underline">Já tenho conta: entrar</Link>
        </p>
      </div>
    </main>
  );
}
