import Link from "next/link";

export const metadata = { title: "Página não encontrada" };

export default function NaoEncontrada() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm text-center">
        <div className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
          <h1 className="text-base font-semibold">Página não encontrada</h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-texto-fraco)]">O endereço não existe ou foi removido.</p>
          <Link href="/conta" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-[var(--color-marca-solida)] px-4 text-sm font-semibold text-[var(--color-marca-contraste)] hover:opacity-90">
            Ir para a minha conta
          </Link>
        </div>
        <p className="mt-6 text-xs text-[var(--color-texto-fraco)]">Avila Ops Tecnologia</p>
      </div>
    </main>
  );
}
