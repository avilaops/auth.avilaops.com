import type { Metadata } from "next";
import Link from "next/link";
import Marca from "@/components/Marca";
import { buscarApp, politicaDaAplicacao } from "@/lib/cadastro";
import { emailConfigurado } from "@/lib/email";
import FormRecuperar from "./FormRecuperar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recuperar senha • Ávila Ops", robots: { index: false, follow: false } };

export default async function PedirRecuperacao({ searchParams }: { searchParams: Promise<{ app?: string; returnTo?: string }> }) {
  const { app: appId, returnTo } = await searchParams;
  const app = await buscarApp(appId);
  const params = new URLSearchParams();
  if (app) params.set("app", app.id);
  if (returnTo) params.set("returnTo", returnTo);
  const permitido = !app || (await politicaDaAplicacao(app.id))?.permiteRecuperacao;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Marca tamanho={48} className="mx-auto mb-5" />
          <h1 className="text-xl font-semibold tracking-tight">Recuperar senha</h1>
          <p className="mt-1.5 text-sm text-[var(--color-texto-fraco)]">Informe o e-mail da sua conta para receber um link e escolher uma nova senha.</p>
        </div>
        <div className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6 shadow-[var(--sombra-1)]">
          {!permitido ? <p className="text-sm text-[var(--color-texto-fraco)]">A recuperação de senha não está habilitada para este sistema.</p>
            : !emailConfigurado() ? <p role="alert" className="text-sm text-[var(--color-texto-fraco)]">O envio de recuperação está temporariamente indisponível. Tente novamente mais tarde.</p>
              : <FormRecuperar app={app?.id ?? null} returnTo={returnTo ?? null} />}
        </div>
        <p className="mt-4 text-center text-sm"><Link href={`/login${params.size ? `?${params}` : ""}`} className="inline-flex min-h-11 items-center text-[var(--color-marca)] hover:underline">Voltar para entrar</Link></p>
      </div>
    </main>
  );
}
