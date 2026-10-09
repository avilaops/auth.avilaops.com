"use client";

import { useRef } from "react";

/**
 * Botão que abre uma folha com um formulário: sobe de baixo no celular, vira
 * painel lateral na tela larga.
 *
 * Existe para a listagem caber numa tela. O formulário de criação ficava no
 * pé da página: no celular eram três telas de rolagem até ele, e o resultado
 * (o segredo, que só aparece uma vez) surgia longe de onde a pessoa estava
 * olhando. Na folha, o que foi criado aparece ali mesmo, e a listagem
 * atualizada fica logo atrás.
 *
 * É um `<dialog>` nativo: prende o foco, fecha com Esc e devolve o foco ao
 * botão. O conteúdo é renderizado no servidor e chega como `children`.
 */
export default function Folha({ rotulo, titulo, descricao, classeDoBotao, children }: { rotulo: string; titulo: string; descricao?: string; classeDoBotao: string; children: React.ReactNode }) {
  const folha = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={classeDoBotao} aria-haspopup="dialog" onClick={() => folha.current?.showModal()}>
        {rotulo}
      </button>
      <dialog
        ref={folha}
        aria-label={titulo}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-0 text-[var(--color-texto)] backdrop:bg-black/50 md:m-auto md:mr-0 md:h-dvh md:max-h-none md:w-[28rem] md:rounded-none md:border-y-0 md:border-r-0"
      >
        <div className="flex max-h-[92dvh] flex-col md:h-dvh md:max-h-none">
          <header className="flex items-start justify-between gap-3 border-b border-[var(--color-borda)] px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">{titulo}</h2>
              {descricao && <p className="mt-0.5 text-xs text-[var(--color-texto-fraco)]">{descricao}</p>}
            </div>
            <button type="button" onClick={() => folha.current?.close()} aria-label="Fechar" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-[var(--color-texto-fraco)] hover:bg-[var(--color-fundo)]">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" /></svg>
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
        </div>
      </dialog>
    </>
  );
}
