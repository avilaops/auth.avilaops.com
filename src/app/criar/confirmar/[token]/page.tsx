import Link from "next/link";
import { lerTokenDeCadastro } from "@/lib/cadastroProprio";
import { buscarContaPorEmail } from "@/lib/contas";
import Marca from "@/components/Marca";
import FormSenha from "@/app/trocar-senha/FormSenha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Criar conta", robots: { index: false } };

/** Segundo passo do cadastro: o link confirmou o e-mail; falta escolher a senha. */
export default async function ConfirmarCadastroPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pedido = lerTokenDeCadastro(token);
  const jaExiste = pedido ? Boolean(await buscarContaPorEmail(pedido.email)) : false;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Marca tamanho={48} className="mx-auto mb-5" />
          <h1 className="text-xl font-semibold tracking-tight">{pedido && !jaExiste ? "Escolha sua senha" : "Criar conta"}</h1>
          <p className="mt-1.5 break-all text-sm text-[var(--color-texto-fraco)]">{pedido ? pedido.email : "Este link não é mais válido."}</p>
        </div>
        <div className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6 shadow-[var(--sombra-1)]">
          {!pedido ? (
            <p className="text-sm text-[var(--color-texto-fraco)]">
              Links de confirmação valem por 24 horas. <Link href="/criar" className="text-[var(--color-marca)] hover:underline">Peça um novo</Link>.
            </p>
          ) : jaExiste ? (
            <p className="text-sm text-[var(--color-texto-fraco)]">
              Este e-mail já tem conta. <Link href="/login" className="text-[var(--color-marca)] hover:underline">Entre com a sua senha</Link>.
            </p>
          ) : (
            <FormSenha destino="/conta" token={token} rota="/api/auth/criar/confirmar" rotuloBotao="Criar conta" />
          )}
        </div>
      </div>
    </main>
  );
}
