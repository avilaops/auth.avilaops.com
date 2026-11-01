"use client";

export default function ErroConta() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <section role="alert" className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
        <h1 className="text-lg font-semibold">Não foi possível carregar sua conta</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-texto-fraco)]">
          Seus dados não puderam ser consultados agora. Isso não significa que você perdeu o acesso aos sistemas.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 min-h-11 rounded-lg bg-[var(--color-marca-solida)] px-4 py-2 text-sm font-semibold text-[var(--color-marca-contraste)] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-marca)]"
        >
          Tentar novamente
        </button>
      </section>
    </main>
  );
}
