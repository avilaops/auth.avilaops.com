"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

/** Abre ou fecha todos os grupos da listagem de uma vez. */
export function ExpandirGrupos({ alvo }: { alvo: string }) {
  const mudar = (abrir: boolean) => {
    for (const d of document.querySelectorAll<HTMLDetailsElement>(`#${alvo} details[data-grupo]`)) d.open = abrir;
  };
  const classe = "min-h-11 rounded-lg px-3 text-xs text-[var(--color-marca)] hover:underline lg:min-h-8";
  return (
    <div className="mb-2 flex justify-end gap-1">
      <button type="button" className={classe} onClick={() => mudar(true)}>Expandir todos</button>
      <button type="button" className={classe} onClick={() => mudar(false)}>Recolher todos</button>
    </div>
  );
}

/**
 * Menu de ações de uma linha. Abre no toque ou no clique (nada depende de
 * passar o mouse), fecha com Esc ou ao clicar fora e devolve o foco ao botão.
 */
export function MenuAcoes({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        botao.current?.focus();
      }
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    raiz.current?.querySelector<HTMLElement>("[role=menu] a, [role=menu] button")?.focus();
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  return (
    <div ref={raiz} className="relative inline-block text-left">
      <button
        ref={botao}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto((v) => !v)}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--color-texto-fraco)] hover:bg-[var(--color-fundo)] hover:text-[var(--color-texto)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-marca)]/40 lg:min-h-9 lg:min-w-9"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="16" cy="10" r="1.6" /></svg>
        <span className="sr-only">Ações de {rotulo}</span>
      </button>
      {aberto && (
        <div
          id={id}
          role="menu"
          aria-label={`Ações de ${rotulo}`}
          onClick={() => setAberto(false)}
          className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-lg border border-[var(--color-borda)] bg-[var(--color-cartao)] py-1 text-sm shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export const itemDeMenu = "flex min-h-11 w-full items-center px-3 text-left hover:bg-[var(--color-fundo)] focus-visible:bg-[var(--color-fundo)] focus-visible:outline-none lg:min-h-9";

/** Explica por que uma ação não está disponível, em vez de escondê-la. */
export function ItemIndisponivel({ children, motivo }: { children: React.ReactNode; motivo: string }) {
  return (
    <div role="menuitem" aria-disabled="true" className="px-3 py-2 text-[var(--color-texto-apagado)]">
      {children}
      <span className="block text-[11px]">{motivo}</span>
    </div>
  );
}

/**
 * "← Contas" das fichas: volta para a listagem do jeito que ela estava
 * (busca, filtros, página) e pede para restaurar a rolagem.
 */
export function VoltarLista({ secao, base, children }: { secao: string; base: string; children: React.ReactNode }) {
  const [href, setHref] = useState(base);
  const chave = `auth-admin:lista:${secao}`;
  useEffect(() => {
    try {
      const busca = sessionStorage.getItem(chave);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a sessão do navegador só existe depois de montar
      if (busca) setHref(`${base}${busca}`);
    } catch {
      /* sem storage: volta para a listagem padrão */
    }
  }, [base, chave]);
  return (
    <Link
      href={href}
      onClick={() => {
        try {
          sessionStorage.setItem(`${chave}:voltar`, "1");
        } catch {
          /* sem storage */
        }
      }}
      className="inline-flex min-h-11 items-center text-xs text-[var(--color-texto-fraco)] hover:text-[var(--color-texto)] lg:min-h-0"
    >
      {children}
    </Link>
  );
}
