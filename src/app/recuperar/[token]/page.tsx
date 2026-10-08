import { validarTokenRecuperacao } from "@/lib/recuperacao";
import Marca from "@/components/Marca";
import FormSenha from "@/app/trocar-senha/FormSenha";

export const dynamic = "force-dynamic";

export default async function RecuperarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const email = await validarTokenRecuperacao(token);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Marca tamanho={48} className="mx-auto mb-5" />
          <h1 className="text-xl font-semibold tracking-tight">Recuperar acesso</h1>
          <p className="mt-1.5 text-sm text-[var(--color-texto-fraco)]">
            {email ?? "Este link não é mais válido."}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6 shadow-[var(--sombra-1)]">
          {email ? (
            <FormSenha destino="/" token={token} />
          ) : (
            <p className="text-sm text-[var(--color-texto-fraco)]">
              Links de recuperação valem por 1 hora e só podem ser usados uma vez. Peça um novo à equipe Avila Ops.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
