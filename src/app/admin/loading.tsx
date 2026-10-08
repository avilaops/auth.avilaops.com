/**
 * Esqueleto mostrado enquanto a tela do painel busca os dados. Sem ele o
 * clique no menu não dá sinal nenhum até a página inteira chegar.
 */
export default function CarregandoPainel() {
  return (
    <div className="mx-auto max-w-6xl" role="status" aria-label="Carregando">
      <div className="h-7 w-40 animate-pulse rounded-lg bg-[var(--color-cartao)]" />
      <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded bg-[var(--color-cartao)]" />
      <div className="mt-6 h-11 animate-pulse rounded-lg bg-[var(--color-cartao)]" />
      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--color-borda)]">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-[var(--color-borda)] px-4 py-4 first:border-t-0">
            <div className="h-4 w-1/3 animate-pulse rounded bg-[var(--color-cartao)]" />
            <div className="h-4 w-24 animate-pulse rounded bg-[var(--color-cartao)]" />
            <div className="ml-auto h-4 w-20 animate-pulse rounded bg-[var(--color-cartao)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
