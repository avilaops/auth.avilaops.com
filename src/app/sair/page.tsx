import type { Metadata } from "next";
import Link from "next/link";
import Marca from "@/components/Marca";
import { normalizarPedidoLogout, PARAMETROS_LOGOUT, PedidoLogoutInvalido } from "@/lib/pedidoLogout";
import { lerSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";
// Formulários POST precisam preservar Origin para a verificação de CSRF.
// same-origin não envia o endereço da confirmação para outros sites.
export const metadata: Metadata = { title: "Encerrar sessão", referrer: "same-origin" };

export default async function SairPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;
  const entrada = new URLSearchParams();
  for (const nome of [...PARAMETROS_LOGOUT, "id_token_hint"]) {
    const valor = parametros[nome];
    for (const item of Array.isArray(valor) ? valor : valor === undefined ? [] : [valor]) entrada.append(nome, item);
  }
  let pedido: URLSearchParams | null = null;
  let erro: string | null = null;
  try {
    pedido = normalizarPedidoLogout(entrada);
  } catch (e) {
    if (!(e instanceof PedidoLogoutInvalido)) throw e;
    erro = e.message;
  }
  const sessao = await lerSessao();

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <div className="w-full max-w-sm">
        <Marca tamanho={48} className="mx-auto mb-5" />
        <h1 className="text-center text-xl font-semibold tracking-tight">Encerrar sessão da conta Ávila Ops?</h1>
        <div className="mt-6 rounded-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6 shadow-[var(--sombra-1)]">
          {erro ? <p role="alert">{erro}</p> : (
            <>
              <p className="text-sm leading-relaxed text-[var(--color-texto-fraco)]">
                {sessao
                  ? "Você encerrará a sessão da sua conta e enviará um aviso de saída aos sistemas conectados."
                  : "Não há sessão ativa da conta neste navegador. Você pode continuar para concluir a saída do sistema de origem."}
              </p>
              {sessao && <p className="mt-3 break-all text-sm font-medium">{sessao.email}</p>}
              <form action={`/api/auth/logout${pedido?.size ? `?${pedido}` : ""}`} method="post" className="mt-5">
                <button type="submit" className="min-h-11 w-full rounded-lg bg-[var(--color-marca-solida)] px-4 py-2 text-sm font-semibold text-white">
                  {sessao ? "Encerrar sessão da conta" : "Continuar"}
                </button>
              </form>
            </>
          )}
          <Link href="/conta" className="mt-3 flex min-h-11 items-center justify-center text-sm font-medium text-[var(--color-marca)]">
            {sessao ? "Manter minha sessão" : "Ir para minha conta"}
          </Link>
        </div>
      </div>
    </main>
  );
}
