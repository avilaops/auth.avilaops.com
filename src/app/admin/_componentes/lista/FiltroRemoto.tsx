"use client";

import { useEffect, useState } from "react";
import { lerPaginaOpcoes, MAX_EMPRESAS_SELECIONADAS, type PaginaOpcoes } from "@/lib/empresasConsulta";
import type { DefFiltro, OpcaoFiltro } from "@/lib/listagem";

/** Só a página atual e até 50 seleções ficam na memória do navegador. */
export default function FiltroRemoto({ filtro, selecionadas, alternar }: {
  filtro: DefFiltro; selecionadas: string[]; alternar: (valor: string) => void;
}) {
  const [consulta, setConsulta] = useState({ busca: "", pag: 1, tentativa: 0 });
  const [resultado, setResultado] = useState<{ chave: string; pagina: PaginaOpcoes } | null>(null);
  const [falha, setFalha] = useState<{ chave: string; texto: string } | null>(null);
  const [rotulos, setRotulos] = useState<OpcaoFiltro[]>(filtro.opcoes);
  const chave = JSON.stringify(consulta);
  const endpoint = filtro.remoto!;
  const carregando = resultado?.chave !== chave && falha?.chave !== chave;
  const pagina = resultado?.chave === chave ? resultado.pagina : null;
  const erro = falha?.chave === chave ? falha.texto : "";

  useEffect(() => {
    const controle = new AbortController();
    const espera = window.setTimeout(() => {
      const params = new URLSearchParams({ q: consulta.busca, pag: String(consulta.pag) });
      void (async () => {
        try {
          const resposta = await fetch(`${endpoint}?${params}`, { signal: controle.signal, cache: "no-store", credentials: "same-origin" });
          if (!resposta.ok) {
            throw new Error(resposta.status === 401 || resposta.status === 403
              ? "Reabra o painel e confirme seu acesso para pesquisar empresas."
              : resposta.status === 429 ? "Aguarde um minuto antes de pesquisar novamente." : "Não foi possível buscar empresas. Tente novamente.");
          }
          const proxima = lerPaginaOpcoes(await resposta.json(), consulta.pag);
          if (!proxima.disponivel) throw new Error("O cadastro de empresas está indisponível para consulta.");
          if (!controle.signal.aborted) setResultado({ chave, pagina: proxima });
        } catch (e) {
          if (!controle.signal.aborted) setFalha({ chave, texto: e instanceof Error ? e.message : "Não foi possível buscar empresas." });
        }
      })();
    }, 300);
    return () => { window.clearTimeout(espera); controle.abort(); };
  }, [endpoint, consulta.busca, consulta.pag, chave]);

  const nomes = new Map([...filtro.opcoes, ...rotulos].map((o) => [o.valor, o]));
  const fixas = filtro.opcoes.filter((o) => o.valor === "sem");
  const escolhas = [...fixas, ...selecionadas.filter((v) => v !== "sem").map((v) => nomes.get(v) ?? { valor: v, rotulo: v })];
  const vistas = new Set(escolhas.map((o) => o.valor));
  const opcoes = [...escolhas, ...(pagina?.opcoes ?? []).filter((o) => !vistas.has(o.valor))];

  function escolher(opcao: OpcaoFiltro) {
    const estava = selecionadas.includes(opcao.valor);
    if (!estava && selecionadas.length >= MAX_EMPRESAS_SELECIONADAS) return;
    const manter = new Set(estava ? selecionadas.filter((v) => v !== opcao.valor) : [...selecionadas, opcao.valor]);
    setRotulos([...nomes.values(), opcao].filter((o, i, todos) => manter.has(o.valor) && todos.findIndex((x) => x.valor === o.valor) === i));
    alternar(opcao.valor);
  }

  return (
    <div>
      <label className="block text-xs text-[var(--color-texto-fraco)]">
        Buscar empresa
        <input type="search" maxLength={120} value={consulta.busca} autoComplete="off"
          onChange={(e) => setConsulta({ busca: e.target.value, pag: 1, tentativa: 0 })}
          className="mt-1 h-11 w-full rounded-lg border border-[var(--color-borda)] bg-[var(--color-fundo)] px-3 text-sm" />
      </label>
      <p className="my-1 text-xs text-[var(--color-texto-fraco)]">Até 50 seleções. As selecionadas permanecem visíveis entre páginas.</p>
      {carregando && <p role="status" className="py-2 text-xs">Buscando empresas…</p>}
      {erro && <div role="alert" className="py-2 text-xs">
        <p>{erro}</p>
        <button type="button" onClick={() => setConsulta({ ...consulta, tentativa: consulta.tentativa + 1 })} className="min-h-11 text-[var(--color-marca)] underline">Tentar novamente</button>
      </div>}
      <div className="max-h-56 overflow-y-auto rounded-lg border border-[var(--color-borda)] p-1" aria-busy={carregando}>
        {opcoes.map((o) => <label key={o.valor} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-[var(--color-fundo)]">
          <input type="checkbox" checked={selecionadas.includes(o.valor)}
            disabled={!selecionadas.includes(o.valor) && selecionadas.length >= MAX_EMPRESAS_SELECIONADAS}
            onChange={() => escolher(o)} />
          <span className="min-w-0 truncate">{o.rotulo}</span>
        </label>)}
      </div>
      {pagina?.opcoes.length === 0 && <p role="status" className="py-2 text-xs">Nenhuma empresa nesta página. Ajuste a busca ou volte à página anterior.</p>}
      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
        <button type="button" disabled={consulta.pag <= 1 || carregando}
          onClick={() => setConsulta({ ...consulta, pag: consulta.pag - 1 })} className="min-h-11 px-2 disabled:opacity-40">Anterior</button>
        <span>Página {consulta.pag}</span>
        <button type="button" disabled={carregando || !pagina?.temMais || consulta.pag >= 100_000}
          onClick={() => setConsulta({ ...consulta, pag: consulta.pag + 1 })} className="min-h-11 px-2 disabled:opacity-40">Próxima</button>
      </div>
    </div>
  );
}
