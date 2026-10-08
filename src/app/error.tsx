"use client";

import { useEffect } from "react";

/**
 * Tela de falha das telas fora do painel. Antes, banco fora do ar ou erro numa consulta caía na
 * página genérica do Next, sem dizer o que fazer. O detalhe técnico não vai
 * para a tela — só o código, para achar a ocorrência no log do servidor.
 */
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6 text-center">
        <h1 className="text-base font-semibold">Não foi possível carregar esta tela</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-texto-fraco)]">
          Algo falhou do nosso lado. Tente de novo; se continuar, avise a equipe da Avila Ops.
        </p>
        {error.digest && <p className="mt-3 font-mono text-[11px] text-[var(--color-texto-apagado)]">código {error.digest}</p>}
        <div className="mt-5 flex justify-center gap-2 text-sm">
          <button onClick={reset} className="inline-flex min-h-11 items-center rounded-lg bg-[var(--color-marca-solida)] px-4 font-semibold text-[var(--color-marca-contraste)] hover:opacity-90">
            Tentar de novo
          </button>
          <a href="/conta" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-borda)] px-4 hover:bg-[var(--color-fundo)]">Minha conta</a>
        </div>
      </div>
    </div>
  );
}
