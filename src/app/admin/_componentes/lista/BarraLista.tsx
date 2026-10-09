"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import {
  ATALHOS_DE_PERIODO,
  COOKIE_BUSCA,
  filtrosAtivos,
  paraParams,
  pareceCpf,
  type Consulta,
  type DefLista,
  type Direcao,
} from "@/lib/listagem";

/**
 * Barra de organização das listagens do painel: busca, atalhos, filtros,
 * ordenação, agrupamento, colunas e densidade.
 *
 * O estado da listagem mora na URL (dá para copiar o link e voltar com o botão
 * do navegador). Este componente só traduz cliques em uma URL nova; quem
 * filtra, ordena e pagina é o servidor, sobre o conjunto inteiro.
 *
 * Preferência de quem usa (colunas e densidade) fica no navegador, por conta e
 * por seção. A última consulta de cada seção fica na sessão do navegador, para
 * o "voltar" das fichas devolver a pessoa ao mesmo recorte.
 */

export type ColunaOpcional = { id: string; rotulo: string };
export type Atalho = { rotulo: string; href: string; ativo: boolean };

type Props = {
  secao: string;
  usuario: string;
  def: DefLista;
  consulta: Consulta;
  placeholder: string;
  /** Texto da busca quando ela não está na URL (CPF). */
  buscaInicial?: string;
  /** Busca que parece CPF vai por cookie de sessão, nunca pela URL. */
  buscaSigilosa?: boolean;
  atalhos?: Atalho[];
  colunas?: ColunaOpcional[];
  /** Colunas escondidas enquanto a pessoa não escolher. */
  ocultasDePadrao?: string[];
  rotuloBusca?: string;
};

const campoBase =
  "min-h-11 rounded-lg border border-[var(--color-borda)] bg-[var(--color-fundo)] px-3 text-sm outline-none focus-visible:border-[var(--color-marca)] focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]/30";
const botaoBarra =
  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--color-borda)] px-3 text-sm hover:bg-[var(--color-cartao)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]/40 lg:min-h-10";

type Preferencia = { ocultas: string[] | null; densidade: "confortavel" | "compacta" };
const PADRAO: Preferencia = { ocultas: null, densidade: "confortavel" };
const ouvintes = new Set<() => void>();
const cache = new Map<string, { texto: string | null; valor: Preferencia }>();

function lerPreferencia(chave: string): Preferencia {
  let texto: string | null = null;
  try {
    texto = localStorage.getItem(chave);
  } catch {
    /* navegador sem storage: fica no padrão */
  }
  const guardado = cache.get(chave);
  if (guardado && guardado.texto === texto) return guardado.valor;
  let valor = PADRAO;
  try {
    const lido = texto ? (JSON.parse(texto) as Partial<Preferencia>) : null;
    if (lido) valor = { ocultas: Array.isArray(lido.ocultas) ? lido.ocultas.map(String) : null, densidade: lido.densidade === "compacta" ? "compacta" : "confortavel" };
  } catch {
    /* preferência corrompida: padrão */
  }
  cache.set(chave, { texto, valor });
  return valor;
}

function assinar(aoMudar: () => void) {
  ouvintes.add(aoMudar);
  window.addEventListener("storage", aoMudar);
  return () => {
    ouvintes.delete(aoMudar);
    window.removeEventListener("storage", aoMudar);
  };
}

function Icone({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d={d} />
    </svg>
  );
}

export default function BarraLista({ secao, usuario, def, consulta, placeholder, buscaInicial, buscaSigilosa, atalhos, colunas, ocultasDePadrao, rotuloBusca = "Buscar" }: Props) {
  const router = useRouter();
  const caminho = usePathname();
  const [pendente, iniciar] = useTransition();
  const chavePref = `auth-admin:${usuario}:${secao}`;
  const pref = useSyncExternalStore(assinar, () => lerPreferencia(chavePref), () => PADRAO);
  const ocultas = pref.ocultas ?? ocultasDePadrao ?? [];

  function gravarPreferencia(nova: Preferencia) {
    try {
      localStorage.setItem(chavePref, JSON.stringify(nova));
    } catch {
      /* sem storage: vale só nesta visita */
    }
    for (const aoMudar of ouvintes) aoMudar();
  }

  function ir(nova: Partial<Consulta>, extra?: Record<string, string>) {
    const params = paraParams({ ...consulta, pag: 1, ...nova }, def);
    for (const [k, v] of Object.entries(extra ?? {})) params.set(k, v);
    const destino = params.size > 0 ? `${caminho}?${params.toString()}` : caminho;
    iniciar(() => router.replace(destino, { scroll: false }));
  }

  // ── Busca ───────────────────────────────────────────────────────────────
  const [texto, setTexto] = useState(buscaInicial ?? consulta.q);
  const ultimaEnviada = useRef(buscaInicial ?? consulta.q);
  useEffect(() => {
    if (texto === ultimaEnviada.current) return;
    // Espera a pessoa parar de digitar. Resposta velha não sobrescreve a nova:
    // cada tecla troca a URL, e o roteador só mostra o resultado da última.
    const espera = window.setTimeout(() => {
      ultimaEnviada.current = texto;
      const termo = texto.trim();
      if (buscaSigilosa && pareceCpf(termo)) {
        document.cookie = `${COOKIE_BUSCA}=${encodeURIComponent(termo)}; Path=/admin; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
        ir({ q: "" }, { qs: "1" });
      } else {
        if (buscaSigilosa) document.cookie = `${COOKIE_BUSCA}=; Path=/admin; Max-Age=0; SameSite=Strict`;
        ir({ q: termo });
      }
    }, 300);
    return () => window.clearTimeout(espera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  // ── Memória da seção, para o "voltar" das fichas ────────────────────────
  // Ao abrir uma ficha, a listagem ainda está montada por um instante com o
  // endereço já trocado. Sem conferir o caminho, ela gravaria a consulta vazia
  // da ficha por cima da própria.
  const caminhoDaLista = useRef(caminho);
  useEffect(() => {
    const chave = `auth-admin:lista:${secao}`;
    if (window.location.pathname !== caminhoDaLista.current) return;
    try {
      sessionStorage.setItem(chave, window.location.search);
      // Só rola de volta quando a pessoa veio do "voltar" de uma ficha.
      if (sessionStorage.getItem(`${chave}:voltar`)) {
        sessionStorage.removeItem(`${chave}:voltar`);
        const [busca, y] = (sessionStorage.getItem(`${chave}:posicao`) ?? "").split("|");
        if (busca === window.location.search) window.scrollTo(0, Number(y) || 0);
      }
    } catch {
      /* sem storage */
    }
    const guardar = () => {
      if (window.location.pathname !== caminhoDaLista.current) return;
      try {
        sessionStorage.setItem(`${chave}:posicao`, `${window.location.search}|${window.scrollY}`);
      } catch {
        /* sem storage */
      }
    };
    window.addEventListener("scroll", guardar, { passive: true });
    return () => window.removeEventListener("scroll", guardar);
  }, [secao, consulta]);

  // ── Painel de filtros: o rascunho só vira consulta em "Aplicar" ─────────
  const painel = useRef<HTMLDialogElement>(null);
  const [rascunho, setRascunho] = useState(consulta.filtros);
  const [periodo, setPeriodo] = useState({ periodo: consulta.periodo, de: consulta.de, ate: consulta.ate });
  const ativos = filtrosAtivos(consulta);
  const noRascunho = Object.values(rascunho).filter((v) => v.length > 0).length + (periodo.periodo || periodo.de || periodo.ate ? 1 : 0);

  function abrirFiltros() {
    setRascunho(consulta.filtros);
    setPeriodo({ periodo: consulta.periodo, de: consulta.de, ate: consulta.ate });
    painel.current?.showModal();
  }
  function alternar(chave: string, valor: string, unico: boolean) {
    setRascunho((atual) => {
      const tem = atual[chave] ?? [];
      const novo = tem.includes(valor) ? tem.filter((v) => v !== valor) : unico ? [valor] : [...tem, valor];
      const copia = { ...atual };
      if (novo.length > 0) copia[chave] = novo;
      else delete copia[chave];
      return copia;
    });
  }
  function aplicar() {
    painel.current?.close();
    ir({ filtros: rascunho, ...periodo });
  }

  const temFiltros = def.filtros.length > 0 || def.periodo;
  const ordemAtual = def.ordens.find((o) => o.campo === consulta.ord);
  const rotuloDir = (campo: string, dir: Direcao) => {
    const o = def.ordens.find((x) => x.campo === campo);
    const [asc, desc] = o?.rotulos ?? ["A–Z", "Z–A"];
    return `${o?.rotulo ?? campo}: ${dir === "asc" ? asc : desc}`;
  };
  const grupoAtual = def.grupos.find((g) => g.valor === consulta.grupo);

  const chips: Array<{ chave: string; texto: string; remover: () => void }> = [];
  for (const f of def.filtros) {
    for (const valor of consulta.filtros[f.chave] ?? []) {
      const opcao = f.opcoes.find((o) => o.valor === valor);
      chips.push({
        chave: `${f.chave}:${valor}`,
        texto: `${f.rotulo}: ${opcao?.rotulo ?? valor}`,
        remover: () => {
          const resto = (consulta.filtros[f.chave] ?? []).filter((v) => v !== valor);
          const filtros = { ...consulta.filtros };
          if (resto.length > 0) filtros[f.chave] = resto;
          else delete filtros[f.chave];
          ir({ filtros });
        },
      });
    }
  }
  if (consulta.periodo || consulta.de || consulta.ate) {
    const atalho = ATALHOS_DE_PERIODO.find((a) => a.valor === consulta.periodo)?.rotulo;
    const dia = (d: string) => d.split("-").reverse().join("/");
    const textoPeriodo = atalho ?? (consulta.de && consulta.ate ? `${dia(consulta.de)} a ${dia(consulta.ate)}` : consulta.de ? `desde ${dia(consulta.de)}` : `até ${dia(consulta.ate)}`);
    chips.push({ chave: "periodo", texto: `Período: ${textoPeriodo}`, remover: () => ir({ periodo: "", de: "", ate: "" }) });
  }

  const css = [
    ...ocultas.map((id) => `#lista-${secao} [data-col="${id.replace(/[^a-z0-9-]/gi, "")}"]{display:none}`),
    pref.densidade === "compacta" ? `#lista-${secao} tbody td{padding-top:.375rem;padding-bottom:.375rem}#lista-${secao} [data-secundario]{display:none}` : "",
  ].join("");

  return (
    <div className="mb-3 flex flex-col gap-2" aria-busy={pendente}>
      {css && <style>{css}</style>}

      {atalhos && atalhos.length > 0 && (
        <nav aria-label="Atalhos" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {atalhos.map((a) => (
            <a
              key={a.rotulo}
              href={a.href}
              onClick={(e) => {
                e.preventDefault();
                iniciar(() => router.replace(a.href, { scroll: false }));
              }}
              aria-current={a.ativo ? "true" : undefined}
              className={`flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm lg:min-h-9 ${
                a.ativo ? "bg-[var(--color-marca-suave)] font-semibold text-[var(--color-marca)]" : "text-[var(--color-texto-fraco)] hover:bg-[var(--color-cartao)] hover:text-[var(--color-texto)]"
              }`}
            >
              {a.rotulo}
            </a>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-64">
          <label className="sr-only" htmlFor={`busca-${secao}`}>{rotuloBusca}</label>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-texto-apagado)]"><Icone d="M9 15A6 6 0 1 0 9 3a6 6 0 0 0 0 12Zm8 2-3.500-3.500" /></span>
          <input
            id={`busca-${secao}`}
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            enterKeyHint="search"
            className={`${campoBase} w-full pl-9 lg:min-h-10`}
          />
        </div>

        {temFiltros && (
          <button type="button" className={botaoBarra} onClick={abrirFiltros} aria-haspopup="dialog">
            <Icone d="M3 5h14M6 10h8M8.500 15h3" />
            Filtros
            {ativos > 0 && <span className="rounded-full bg-[var(--color-marca-solida)] px-1.5 text-xs font-semibold text-[var(--color-marca-contraste)]" aria-label={`${ativos} ativo${ativos === 1 ? "" : "s"}`}>{ativos}</span>}
          </button>
        )}

        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm sm:flex-none">
          <span className="sr-only sm:not-sr-only sm:text-xs sm:text-[var(--color-texto-fraco)]">Ordenar</span>
          <select
            aria-label="Ordenar por"
            value={`${consulta.ord}:${consulta.dir}`}
            onChange={(e) => {
              const [ord, dir] = e.target.value.split(":");
              ir({ ord, dir: dir as Direcao });
            }}
            className={`${campoBase} w-full min-w-0 sm:w-auto sm:max-w-[13rem] lg:min-h-10`}
          >
            {def.ordens.flatMap((o) => (["asc", "desc"] as const).map((dir) => <option key={`${o.campo}:${dir}`} value={`${o.campo}:${dir}`}>{rotuloDir(o.campo, dir)}</option>))}
          </select>
        </label>

        {def.grupos.length > 0 && (
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm sm:flex-none">
            <span className="sr-only sm:not-sr-only sm:text-xs sm:text-[var(--color-texto-fraco)]">Agrupar</span>
            <select aria-label="Agrupar por" value={consulta.grupo} onChange={(e) => ir({ grupo: e.target.value })} className={`${campoBase} w-full min-w-0 sm:w-auto sm:max-w-[11rem] lg:min-h-10`}>
              <option value="">Sem agrupamento</option>
              {def.grupos.map((g) => <option key={g.valor} value={g.valor}>Por {g.rotulo.toLowerCase()}</option>)}
            </select>
          </label>
        )}

        {/* Colunas e densidade só fazem sentido na tabela, que existe a partir de 768px. */}
        <div className="ml-auto hidden items-center gap-2 md:flex">
          {colunas && colunas.length > 0 && (
            <details className="relative">
              <summary className={`${botaoBarra} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                <Icone d="M3 4h4v12H3zM8 4h4v12H8zM13 4h4v12h-4z" />
                Colunas
              </summary>
              <fieldset className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-[var(--color-borda)] bg-[var(--color-cartao)] p-2 shadow-lg">
                <legend className="sr-only">Colunas visíveis</legend>
                {colunas.map((c) => (
                  <label key={c.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-[var(--color-fundo)]">
                    <input
                      type="checkbox"
                      checked={!ocultas.includes(c.id)}
                      onChange={(e) => gravarPreferencia({ ...pref, ocultas: e.target.checked ? ocultas.filter((id) => id !== c.id) : [...ocultas, c.id] })}
                    />
                    {c.rotulo}
                  </label>
                ))}
              </fieldset>
            </details>
          )}
          <button
            type="button"
            className={botaoBarra}
            aria-pressed={pref.densidade === "compacta"}
            title="Alternar entre linhas confortáveis e compactas"
            onClick={() => gravarPreferencia({ ...pref, densidade: pref.densidade === "compacta" ? "confortavel" : "compacta" })}
          >
            <Icone d={pref.densidade === "compacta" ? "M3 5h14M3 8.500h14M3 12h14M3 15.500h14" : "M3 5h14M3 10h14M3 15h14"} />
            {pref.densidade === "compacta" ? "Compacta" : "Confortável"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-texto-fraco)]">
        {chips.map((c) => (
          <button
            key={c.chave}
            type="button"
            onClick={c.remover}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--color-borda)] bg-[var(--color-cartao)] pl-3 pr-2 text-[var(--color-texto)] hover:border-[var(--color-marca)]"
          >
            {c.texto}
            <span aria-hidden="true" className="text-[var(--color-texto-fraco)]">×</span>
            <span className="sr-only">Remover filtro</span>
          </button>
        ))}
        {(chips.length > 0 || consulta.q || buscaInicial) && (
          <button
            type="button"
            onClick={() => {
              setTexto("");
              ultimaEnviada.current = "";
              if (buscaSigilosa) document.cookie = `${COOKIE_BUSCA}=; Path=/admin; Max-Age=0; SameSite=Strict`;
              ir({ q: "", filtros: {}, periodo: "", de: "", ate: "" });
            }}
            className="inline-flex min-h-9 items-center px-2 text-[var(--color-marca)] hover:underline"
          >
            Limpar filtros
          </button>
        )}
        <span className="py-1">
          Ordenado por {ordemAtual ? rotuloDir(consulta.ord, consulta.dir) : "padrão"}
          {grupoAtual ? ` · agrupado por ${grupoAtual.rotulo.toLowerCase()}` : ""}
        </span>
      </div>

      {temFiltros && (
        <dialog
          ref={painel}
          aria-labelledby={`filtros-titulo-${secao}`}
          className="m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-0 text-[var(--color-texto)] backdrop:bg-black/50 md:m-auto md:mr-0 md:h-dvh md:max-h-none md:w-[26rem] md:rounded-none md:border-y-0 md:border-r-0"
          onClick={(e) => {
            if (e.target === e.currentTarget) e.currentTarget.close();
          }}
        >
          <form
            method="dialog"
            className="flex max-h-[85dvh] flex-col md:h-dvh md:max-h-none"
            onSubmit={(e) => {
              e.preventDefault();
              aplicar();
            }}
          >
            <header className="flex items-center justify-between gap-3 border-b border-[var(--color-borda)] px-4 py-3">
              <h2 id={`filtros-titulo-${secao}`} className="text-base font-semibold">
                Filtros{noRascunho > 0 ? ` (${noRascunho})` : ""}
              </h2>
              <button type="button" onClick={() => painel.current?.close()} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--color-texto-fraco)] hover:bg-[var(--color-fundo)]" aria-label="Fechar filtros">
                <Icone d="M5 5l10 10M15 5 5 15" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {def.periodo && (
                <fieldset className="mb-4">
                  <legend className="mb-2 text-sm font-medium">Período</legend>
                  <div className="flex flex-wrap gap-2">
                    {ATALHOS_DE_PERIODO.map((a) => (
                      <button
                        key={a.valor}
                        type="button"
                        aria-pressed={periodo.periodo === a.valor}
                        onClick={() => setPeriodo(periodo.periodo === a.valor ? { periodo: "", de: "", ate: "" } : { periodo: a.valor, de: "", ate: "" })}
                        className={`min-h-11 rounded-lg border px-3 text-sm ${periodo.periodo === a.valor ? "border-[var(--color-marca)] bg-[var(--color-marca-suave)] font-semibold text-[var(--color-marca)]" : "border-[var(--color-borda)]"}`}
                      >
                        {a.rotulo}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">De
                      <input type="date" value={periodo.de} max={periodo.ate || undefined} onChange={(e) => setPeriodo({ periodo: "", de: e.target.value, ate: periodo.ate })} className={`${campoBase} w-full`} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Até
                      <input type="date" value={periodo.ate} min={periodo.de || undefined} onChange={(e) => setPeriodo({ periodo: "", de: periodo.de, ate: e.target.value })} className={`${campoBase} w-full`} />
                    </label>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--color-texto-fraco)]">Dias contados no horário de Brasília.</p>
                </fieldset>
              )}

              {def.filtros.map((f) => (
                <fieldset key={f.chave} className="mb-4">
                  <legend className="mb-1 text-sm font-medium">
                    {f.rotulo}
                    {(rascunho[f.chave]?.length ?? 0) > 0 && <span className="ml-1 text-xs font-normal text-[var(--color-texto-fraco)]">({rascunho[f.chave].length})</span>}
                  </legend>
                  <div className={f.opcoes.length > 8 ? "max-h-56 overflow-y-auto rounded-lg border border-[var(--color-borda)] p-1" : ""}>
                    {f.opcoes.map((o) => (
                      <label key={o.valor} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-[var(--color-fundo)] md:min-h-9">
                        <input
                          type={f.tipo === "unico" ? "radio" : "checkbox"}
                          name={`f-${secao}-${f.chave}`}
                          checked={(rascunho[f.chave] ?? []).includes(o.valor)}
                          onChange={() => alternar(f.chave, o.valor, f.tipo === "unico")}
                          onClick={() => {
                            // Rádio marcado, clicado de novo, desmarca: "único" não é "obrigatório".
                            if (f.tipo === "unico" && (rascunho[f.chave] ?? []).includes(o.valor)) alternar(f.chave, o.valor, true);
                          }}
                        />
                        <span className="min-w-0 truncate">{o.rotulo}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>

            <footer className="flex gap-2 border-t border-[var(--color-borda)] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => {
                  setRascunho({});
                  setPeriodo({ periodo: "", de: "", ate: "" });
                }}
                className="min-h-11 flex-1 rounded-lg border border-[var(--color-borda)] px-4 text-sm hover:bg-[var(--color-fundo)]"
              >
                Limpar
              </button>
              <button type="submit" className="min-h-11 flex-1 rounded-lg bg-[var(--color-marca-solida)] px-4 text-sm font-semibold text-[var(--color-marca-contraste)] hover:opacity-90">
                Aplicar
              </button>
            </footer>
          </form>
        </dialog>
      )}
    </div>
  );
}
