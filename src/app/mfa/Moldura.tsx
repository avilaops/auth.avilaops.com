import Marca from "@/components/Marca";

/**
 * A moldura das telas de segundo fator — a mesma do `/login`, para a pessoa
 * enxergar que continua no mesmo lugar, no meio do mesmo ato.
 */
export default function Moldura({
  titulo,
  subtitulo,
  largura = "max-w-sm",
  children,
}: {
  titulo: string;
  subtitulo?: string;
  largura?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className={`w-full ${largura}`}>
        <div className="mb-8 text-center">
          <Marca tamanho={48} className="mx-auto mb-5" />
          <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
          {subtitulo && <p className="mt-1.5 text-sm text-[var(--color-texto-fraco)]">{subtitulo}</p>}
        </div>
        <div className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6 shadow-[var(--sombra-1)]">{children}</div>
      </div>
    </main>
  );
}
