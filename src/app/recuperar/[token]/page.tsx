import { buscarApp } from "@/lib/cadastro";
import { buscarContaPorEmail } from "@/lib/contas";
import { ehPrimeiraSenha } from "@/lib/convite";
import { validarTokenRecuperacao } from "@/lib/recuperacao";
import Marca from "@/components/Marca";
import FormSenha from "@/app/trocar-senha/FormSenha";

export const dynamic = "force-dynamic";

export default async function RecuperarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await validarTokenRecuperacao(token);
  const conta = link ? await buscarContaPorEmail(link.email) : null;
  // Quem chega por convite nunca teve senha: "recuperar" não é a palavra.
  const primeira = conta !== null && ehPrimeiraSenha(conta);
  const app = link?.appId ? await buscarApp(link.appId) : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Marca tamanho={48} className="mx-auto mb-5" />
          <h1 className="text-xl font-semibold tracking-tight">{primeira ? "Crie a sua senha" : "Recuperar acesso"}</h1>
          <p className="mt-1.5 text-sm text-[var(--color-texto-fraco)]">
            {link?.email ?? "Este link não é mais válido."}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6 shadow-[var(--sombra-1)]">
          {link ? (
            <>
              <FormSenha destino="/" token={token} rotuloBotao={app ? `Salvar e entrar em ${app.nome}` : undefined} />
              {app && (
                <p className="mt-3 text-xs text-[var(--color-texto-fraco)]">
                  Nas próximas vezes, entre com este e-mail e a senha que escolher agora.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-[var(--color-texto-fraco)]">
              O link expirou ou já foi usado. Peça um novo a quem enviou o convite ou à equipe Avila Ops.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
