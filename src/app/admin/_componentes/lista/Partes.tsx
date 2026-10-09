import Link from "next/link";
import { paraParams, plural, TAMANHOS_DE_PAGINA, type Consulta, type DefLista, type Pagina } from "@/lib/listagem";

/**
 * Peças de servidor das listagens: cabeçalho ordenável, resumo, paginação,
 * grupo expansível e estado vazio. Todas produzem links comuns, então a
 * listagem funciona antes de o JavaScript carregar e o botão "voltar" do
 * navegador refaz cada passo.
 */

function url(base: string, consulta: Consulta, def: DefLista, mudanca: Partial<Consulta>, extra?: string): string {
  const p = paraParams({ ...consulta, ...mudanca }, def);
  if (extra) for (const [k, v] of new URLSearchParams(extra)) p.set(k, v);
  return p.size > 0 ? `${base}?${p.toString()}` : base;
}

export const celula = "px-3 py-2.5 align-middle";
export const cabecalho = "px-3 py-2.5 text-left text-xs font-medium text-[var(--color-texto-fraco)]";
export const moldura = "overflow-hidden rounded-xl border border-[var(--color-borda)]";
export const linha = "border-t border-[var(--color-borda)] hover:bg-[var(--color-cartao)] focus-within:bg-[var(--color-cartao)]";
export const secundario = "truncate text-xs text-[var(--color-texto-fraco)]";

/** Cabeçalho de coluna. Com `campo`, vira link que ordena e anuncia a direção. */
export function Th({
  children,
  campo,
  base,
  consulta,
  def,
  extra,
  className = "",
  col,
}: {
  children: React.ReactNode;
  campo?: string;
  base: string;
  consulta: Consulta;
  def: DefLista;
  extra?: string;
  className?: string;
  col?: string;
}) {
  if (!campo) return <th scope="col" data-col={col} className={`${cabecalho} ${className}`}>{children}</th>;
  const ativa = consulta.ord === campo;
  const padrao = def.ordens.find((o) => o.campo === campo)?.padrao ?? "asc";
  const proxima = ativa ? (consulta.dir === "asc" ? "desc" : "asc") : padrao;
  return (
    <th scope="col" data-col={col} aria-sort={ativa ? (consulta.dir === "asc" ? "ascending" : "descending") : "none"} className={`${cabecalho} ${className}`}>
      <Link
        href={url(base, consulta, def, { ord: campo, dir: proxima, pag: 1 }, extra)}
        scroll={false}
        className={`-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-[var(--color-texto)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]/40 ${ativa ? "text-[var(--color-texto)]" : ""}`}
      >
        {children}
        <span aria-hidden="true" className={ativa ? "text-[var(--color-marca)]" : "text-[var(--color-texto-apagado)]"}>
          {ativa ? (consulta.dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
        <span className="sr-only">{ativa ? (consulta.dir === "asc" ? "ordem crescente; ativar para decrescente" : "ordem decrescente; ativar para crescente") : "ordenar"}</span>
      </Link>
    </th>
  );
}

/** "12 de 19 contas": separa o que existe do que os filtros deixaram passar. */
export function Resumo({ encontrados, total, um, varios, complemento }: { encontrados: number; total: number; um: string; varios: string; complemento?: string }) {
  return (
    <p className="mt-1 text-sm text-[var(--color-texto-fraco)]" aria-live="polite">
      {encontrados === total ? plural(total, um, varios) : `${encontrados.toLocaleString("pt-BR")} de ${plural(total, um, varios)}`}
      {complemento ? ` · ${complemento}` : ""}
    </p>
  );
}

export function Paginacao<T>({ pagina, base, consulta, def, extra, rotulo }: { pagina: Pagina<T>; base: string; consulta: Consulta; def: DefLista; extra?: string; rotulo: string }) {
  if (pagina.total === 0) return null;
  // Tudo cabe na menor página: os controles seriam só ruído, e o total já está
  // no cabeçalho da seção.
  if (pagina.total <= TAMANHOS_DE_PAGINA[0]) return null;
  const botao = "flex min-h-11 items-center rounded-lg border border-[var(--color-borda)] px-3 text-sm hover:bg-[var(--color-cartao)] lg:min-h-9";
  const inativo = "flex min-h-11 items-center rounded-lg border border-[var(--color-borda)] px-3 text-sm text-[var(--color-texto-apagado)] lg:min-h-9";
  return (
    <nav aria-label={`Paginação de ${rotulo}`} className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-texto-fraco)]">
      <span>
        {pagina.de.toLocaleString("pt-BR")}–{pagina.ate.toLocaleString("pt-BR")} de {pagina.total.toLocaleString("pt-BR")}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="hidden text-xs sm:inline">Por página</span>
        <div className="flex overflow-hidden rounded-lg border border-[var(--color-borda)]" role="group" aria-label="Registros por página">
          {TAMANHOS_DE_PAGINA.map((n) => (
            <Link
              key={n}
              href={url(base, consulta, def, { por: n, pag: 1 }, extra)}
              scroll={false}
              aria-current={consulta.por === n ? "true" : undefined}
              className={`flex min-h-11 min-w-11 items-center justify-center px-2 text-xs lg:min-h-9 lg:min-w-9 ${consulta.por === n ? "bg-[var(--color-marca-suave)] font-semibold text-[var(--color-marca)]" : "hover:bg-[var(--color-cartao)]"}`}
            >
              {n}
            </Link>
          ))}
        </div>
        {pagina.pag > 1
          ? <Link href={url(base, consulta, def, { pag: pagina.pag - 1 }, extra)} className={botao} rel="prev">Anterior</Link>
          : <span className={inativo} aria-disabled="true">Anterior</span>}
        <span className="text-xs tabular-nums">Página {pagina.pag} de {pagina.paginas}</span>
        {pagina.pag < pagina.paginas
          ? <Link href={url(base, consulta, def, { pag: pagina.pag + 1 }, extra)} className={botao} rel="next">Próxima</Link>
          : <span className={inativo} aria-disabled="true">Próxima</span>}
      </div>
    </nav>
  );
}

/** Um grupo da listagem. Usa `<details>`: abre e fecha sem JavaScript e pelo teclado. */
export function SecaoGrupo({ rotulo, quantidade, um, varios, children, aberto = true }: { rotulo: string; quantidade: number; um: string; varios: string; children: React.ReactNode; aberto?: boolean }) {
  return (
    <details data-grupo open={aberto} className="group mb-3 rounded-xl border border-[var(--color-borda)]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl bg-[var(--color-cartao)] px-3 text-sm font-semibold group-open:rounded-b-none [&::-webkit-details-marker]:hidden">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[var(--color-texto-fraco)] transition-transform group-open:rotate-90">
          <path d="m7 4 6 6-6 6" />
        </svg>
        <span className="min-w-0 truncate">{rotulo}</span>
        <span className="ml-auto shrink-0 text-xs font-normal text-[var(--color-texto-fraco)]">{plural(quantidade, um, varios)}</span>
      </summary>
      <div className="overflow-hidden rounded-b-xl">{children}</div>
    </details>
  );
}

export function Vazio({ semCadastro, filtrado, base, acao }: { semCadastro: string; filtrado: boolean; base: string; acao?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-borda)] px-4 py-10 text-center text-sm">
      {filtrado ? (
        <>
          <p className="font-medium">Nada encontrado com esta busca e estes filtros.</p>
          <p className="mt-1 text-[var(--color-texto-fraco)]">Os registros existem; o recorte é que não trouxe nenhum.</p>
          <Link href={base} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-[var(--color-borda)] px-4 hover:bg-[var(--color-cartao)]">Limpar filtros</Link>
        </>
      ) : (
        <>
          <p className="text-[var(--color-texto-fraco)]">{semCadastro}</p>
          {acao && <div className="mt-3">{acao}</div>}
        </>
      )}
    </div>
  );
}

/** Estado em texto com um ponto de cor: a cor reforça, a palavra é que informa. */
export function Estado({ tom, children }: { tom: "bom" | "ruim" | "atencao" | "neutro" | "info"; children: React.ReactNode }) {
  const ponto = { bom: "bg-emerald-400", ruim: "bg-red-400", atencao: "bg-amber-400", neutro: "bg-[var(--color-texto-apagado)]", info: "bg-sky-400" }[tom];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${ponto}`} />
      {children}
    </span>
  );
}
