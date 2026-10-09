"use client";

import Link from "next/link";
import { useRef, useState } from "react";

export type EventoLinha = {
  id: string;
  tipo: string;
  rotulo: string;
  resultado: "sucesso" | "falha" | "atencao" | "informativo";
  rotuloResultado: string;
  data: string;
  hora: string;
  iso: string;
  autor: string | null;
  alvo: string | null;
  proprio: boolean;
  appId: string | null;
  appNome: string | null;
  ip: string | null;
  detalhe: string | null;
};

const PONTO: Record<EventoLinha["resultado"], string> = {
  sucesso: "bg-emerald-400",
  falha: "bg-red-400",
  atencao: "bg-amber-400",
  informativo: "bg-[var(--color-texto-apagado)]",
};

function Resultado({ e }: { e: EventoLinha }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs">
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${PONTO[e.resultado]}`} />
      {e.rotuloResultado}
    </span>
  );
}

const celula = "px-3 py-2 align-top";
const cabecalho = "px-3 py-2.5 text-left text-xs font-medium text-[var(--color-texto-fraco)]";

/**
 * Linhas da auditoria e o painel de detalhes.
 *
 * A linha mostra o resumo; o detalhe completo abre num painel lateral (tela
 * larga) ou em tela cheia (celular). Autor e alvo vêm separados do servidor:
 * quem fez não é preenchido com quem sofreu a ação.
 */
export default function ListaEventos({ eventos, fuso }: { eventos: EventoLinha[]; fuso: string }) {
  const painel = useRef<HTMLDialogElement>(null);
  const [aberto, setAberto] = useState<EventoLinha | null>(null);
  const [tecnico, setTecnico] = useState(false);

  function abrir(e: EventoLinha) {
    setAberto(e);
    setTecnico(false);
    painel.current?.showModal();
  }

  return (
    <>
      <ul className="divide-y divide-[var(--color-borda)] overflow-hidden rounded-xl border border-[var(--color-borda)] md:hidden">
        {eventos.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => abrir(e)} className="block w-full px-3 py-2.5 text-left active:bg-[var(--color-cartao)]">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 truncate font-medium">{e.rotulo}</span>
                <span className="shrink-0 text-xs tabular-nums text-[var(--color-texto-fraco)]">{e.data} {e.hora.slice(0, 5)}</span>
              </div>
              <div className="truncate text-xs text-[var(--color-texto-fraco)]">
                {e.autor ?? "Autor não registrado"}
                {e.alvo ? ` → ${e.alvo}` : ""}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--color-texto-fraco)]">
                <Resultado e={e} />
                {e.appNome && <span className="min-w-0 truncate">· {e.appNome}</span>}
              </div>
            </button>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-xl border border-[var(--color-borda)] md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Eventos de auditoria, horários de {fuso}</caption>
          <thead className="bg-[var(--color-cartao)]">
            <tr>
              <th scope="col" className={`${cabecalho} w-40`}>Data e hora</th>
              <th scope="col" className={cabecalho}>Evento</th>
              <th scope="col" className={cabecalho}>Quem fez</th>
              <th scope="col" data-col="alvo" className={`${cabecalho} hidden xl:table-cell`}>Alvo</th>
              <th scope="col" data-col="app" className={`${cabecalho} hidden w-40 xl:table-cell`}>Aplicação</th>
              <th scope="col" data-col="resultado" className={`${cabecalho} w-36`}>Resultado</th>
              <th scope="col" className="w-24 px-1"><span className="sr-only">Detalhes</span></th>
            </tr>
          </thead>
          <tbody>
            {eventos.map((e) => (
              <tr key={e.id} className="border-t border-[var(--color-borda)] hover:bg-[var(--color-cartao)]">
                <td className={`${celula} whitespace-nowrap text-xs tabular-nums text-[var(--color-texto-fraco)]`}>
                  <time dateTime={e.iso}>{e.data} <span data-secundario>{e.hora}</span></time>
                </td>
                <td className={`${celula} max-w-0`}>
                  <div className="truncate font-medium" title={e.tipo}>{e.rotulo}</div>
                  {e.detalhe && <div data-secundario className="truncate text-xs text-[var(--color-texto-fraco)]">{e.detalhe}</div>}
                </td>
                <td className={`${celula} max-w-0`}>
                  {e.autor
                    ? <Link href={`/admin/eventos?q=${encodeURIComponent(e.autor)}`} className="block truncate text-xs hover:text-[var(--color-marca)]" title="Ver a atividade deste e-mail">{e.autor}</Link>
                    : <span className="text-xs text-[var(--color-texto-apagado)]">Não registrado</span>}
                  {(e.alvo || e.appNome) && (
                    <span className="block truncate text-xs text-[var(--color-texto-fraco)] xl:hidden">
                      {e.alvo ? `→ ${e.alvo}` : ""}{e.alvo && e.appNome ? " · " : ""}{e.appNome ?? ""}
                    </span>
                  )}
                </td>
                <td data-col="alvo" className={`${celula} hidden max-w-0 xl:table-cell`}>
                  {e.alvo
                    ? <Link href={`/admin/eventos?q=${encodeURIComponent(e.alvo)}`} className="block truncate text-xs hover:text-[var(--color-marca)]">{e.alvo}</Link>
                    : <span className="block truncate text-xs text-[var(--color-texto-apagado)]">{e.proprio ? "A própria conta" : "—"}</span>}
                </td>
                <td data-col="app" className={`${celula} hidden max-w-0 xl:table-cell`}>
                  <span className="block truncate text-xs text-[var(--color-texto-fraco)]">{e.appNome ?? e.appId ?? "—"}</span>
                </td>
                <td data-col="resultado" className={celula}><Resultado e={e} /></td>
                <td className="px-1 text-right">
                  <button type="button" onClick={() => abrir(e)} className="min-h-9 rounded-lg px-2 text-xs text-[var(--color-marca)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]/40">
                    Detalhes
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dialog
        ref={painel}
        aria-labelledby="evento-titulo"
        onClick={(ev) => {
          if (ev.target === ev.currentTarget) ev.currentTarget.close();
        }}
        className="m-0 h-dvh max-h-none w-full max-w-none border-0 bg-[var(--color-cartao)] p-0 text-[var(--color-texto)] backdrop:bg-black/50 md:ml-auto md:w-[28rem] md:border-l md:border-[var(--color-borda)]"
      >
        {aberto && (
          <div className="flex h-dvh flex-col">
            <header className="flex items-start justify-between gap-3 border-b border-[var(--color-borda)] px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
              <div className="min-w-0">
                <h2 id="evento-titulo" className="text-base font-semibold">{aberto.rotulo}</h2>
                <p className="text-xs text-[var(--color-texto-fraco)]">{aberto.data}, {aberto.hora} · {fuso}</p>
              </div>
              <button type="button" onClick={() => painel.current?.close()} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-[var(--color-texto-fraco)] hover:bg-[var(--color-fundo)]" aria-label="Fechar detalhes">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" /></svg>
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-3 text-sm">
                <dt className="text-[var(--color-texto-fraco)]">Resultado</dt>
                <dd><Resultado e={aberto} /></dd>
                <dt className="text-[var(--color-texto-fraco)]">Quem fez</dt>
                <dd className="break-all">{aberto.autor ?? <span className="text-[var(--color-texto-fraco)]">O evento não registra quem fez</span>}</dd>
                <dt className="text-[var(--color-texto-fraco)]">Alvo</dt>
                <dd className="break-all">{aberto.alvo ?? <span className="text-[var(--color-texto-fraco)]">{aberto.proprio ? "A própria conta" : "Nenhuma conta envolvida"}</span>}</dd>
                <dt className="text-[var(--color-texto-fraco)]">Aplicação</dt>
                <dd className="break-all">{aberto.appNome ? `${aberto.appNome} (${aberto.appId})` : (aberto.appId ?? <span className="text-[var(--color-texto-fraco)]">Não registrada</span>)}</dd>
                <dt className="text-[var(--color-texto-fraco)]">Empresa</dt>
                <dd className="text-[var(--color-texto-fraco)]">A auditoria não registra empresa</dd>
                <dt className="text-[var(--color-texto-fraco)]">Endereço IP</dt>
                <dd className="break-all font-mono text-xs">{aberto.ip ?? <span className="font-sans text-sm text-[var(--color-texto-fraco)]">Não registrado</span>}</dd>
                <dt className="text-[var(--color-texto-fraco)]">Detalhe</dt>
                <dd className="break-words">{aberto.detalhe ?? <span className="text-[var(--color-texto-fraco)]">Sem detalhe</span>}</dd>
              </dl>

              <div className="mt-5 flex flex-wrap gap-2">
                {[aberto.autor, aberto.alvo].filter((v, i, lista): v is string => Boolean(v) && lista.indexOf(v) === i).map((email) => (
                  <Link key={email} href={`/admin/eventos?q=${encodeURIComponent(email)}`} onClick={() => painel.current?.close()} className="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-borda)] px-3 text-xs hover:bg-[var(--color-fundo)]">
                    Atividade de {email}
                  </Link>
                ))}
              </div>

              <button type="button" onClick={() => setTecnico((v) => !v)} aria-expanded={tecnico} className="mt-5 min-h-11 text-xs text-[var(--color-marca)] hover:underline">
                {tecnico ? "Ocultar registro técnico" : "Ver registro técnico"}
              </button>
              {tecnico && (
                <pre className="mt-1 overflow-x-auto rounded-lg border border-[var(--color-borda)] bg-[var(--color-fundo)] p-3 text-[11px] leading-relaxed">
                  {JSON.stringify({ id: aberto.id, tipo: aberto.tipo, criadoEm: aberto.iso, email: aberto.proprio ? aberto.autor : aberto.alvo, autor: aberto.proprio ? null : aberto.autor, appId: aberto.appId, ip: aberto.ip, detalhe: aberto.detalhe }, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
