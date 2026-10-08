import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import Marca from "@/components/Marca";
import FormSenha from "./FormSenha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trocar senha" };

export default async function TrocarSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");
  const { returnTo } = await searchParams;
  const destino = returnTo && !returnTo.startsWith("//") ? returnTo : "/";

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Marca tamanho={48} className="mx-auto mb-5" />
          <h1 className="text-xl font-semibold tracking-tight">Definir nova senha</h1>
          <p className="mt-1.5 text-sm text-[var(--color-texto-fraco)]">{sessao.email}</p>
        </div>
        <div className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6 shadow-[var(--sombra-1)]">
          <FormSenha destino={destino} />
        </div>
      </div>
    </main>
  );
}
