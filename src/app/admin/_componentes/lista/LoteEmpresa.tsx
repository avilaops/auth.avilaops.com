"use client";

import { useActionState, useEffect, useState } from "react";
import { FORM_LOTE } from "@/lib/listagem";
import type { Resultado } from "../../actions";

type Acao = (estado: Resultado | null, fd: FormData) => Promise<Resultado>;


/**
 * Vincular várias contas a uma empresa de uma vez.
 *
 * As caixas de seleção ficam nas linhas da listagem (renderizadas no servidor)
 * e apontam para este formulário pelo atributo `form`. A barra só aparece
 * quando há conta marcada e fica presa ao pé da tela, acima da área segura do
 * celular, sem cobrir a última linha: a listagem ganha um respiro embaixo
 * enquanto ela está visível.
 */
export default function LoteEmpresa({ acao, empresas }: { acao: Acao; empresas: Array<{ id: string; nome: string }> }) {
  const [estado, enviar, pendente] = useActionState(acao, null);
  const [marcadas, setMarcadas] = useState(0);

  useEffect(() => {
    const contar = () => {
      const ids = new Set([...document.querySelectorAll<HTMLInputElement>(`input[form="${FORM_LOTE}"][name="ids"]:checked`)].map((i) => i.value));
      setMarcadas(ids.size);
    };
    document.addEventListener("change", contar);
    contar();
    return () => document.removeEventListener("change", contar);
  }, []);

  // Depois de gravar, a listagem volta do servidor sem nada marcado.
  useEffect(() => {
    if (!estado?.ok) return;
    for (const caixa of document.querySelectorAll<HTMLInputElement>(`input[form="${FORM_LOTE}"]:checked`)) caixa.checked = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- espelha as caixas, que vivem fora do React
    setMarcadas(0);
  }, [estado]);

  function limpar() {
    for (const caixa of document.querySelectorAll<HTMLInputElement>(`input[form="${FORM_LOTE}"]:checked`)) caixa.checked = false;
    setMarcadas(0);
  }

  return (
    <>
      <form id={FORM_LOTE} action={enviar} />
      {estado && !pendente && marcadas === 0 && (
        <p role={estado.ok ? "status" : "alert"} className={`mb-2 text-xs ${estado.ok ? "text-emerald-400" : "text-red-400"}`}>
          {estado.ok ? estado.mensagem : estado.erro}
        </p>
      )}
      {marcadas > 0 && (
        <>
          <div aria-hidden="true" className="h-24" />
          <div
            role="region"
            aria-label="Ação em lote"
            className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-borda)] bg-[var(--color-cartao)] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.25)] lg:left-60"
          >
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
              <span className="text-sm font-medium" aria-live="polite">
                {marcadas} {marcadas === 1 ? "conta marcada" : "contas marcadas"}
              </span>
              <label className="flex min-w-0 flex-1 basis-52 items-center gap-2 text-sm">
                <span className="sr-only">Empresa</span>
                <select name="empresa" form={FORM_LOTE} defaultValue="" required className="min-h-11 w-full min-w-0 rounded-lg border border-[var(--color-borda)] bg-[var(--color-fundo)] px-3 text-sm">
                  <option value="" disabled>Escolha a empresa…</option>
                  {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                  <option value="__nenhuma">Tirar o vínculo com empresa</option>
                </select>
              </label>
              <button type="submit" form={FORM_LOTE} disabled={pendente} className="min-h-11 rounded-lg bg-[var(--color-marca-solida)] px-4 text-sm font-semibold text-[var(--color-marca-contraste)] hover:opacity-90 disabled:opacity-60">
                {pendente ? "Gravando…" : "Vincular"}
              </button>
              <button type="button" onClick={limpar} className="min-h-11 rounded-lg border border-[var(--color-borda)] px-4 text-sm hover:bg-[var(--color-fundo)]">
                Cancelar
              </button>
            </div>
            {estado && !estado.ok && <p role="alert" className="mx-auto mt-2 max-w-7xl text-xs text-red-400">{estado.erro}</p>}
          </div>
        </>
      )}
    </>
  );
}

/** Marca ou desmarca todas as contas visíveis de uma tabela. */
export function MarcarTodas({ alvo }: { alvo: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Marcar todas as contas desta lista"
      className="h-4 w-4"
      onChange={(e) => {
        const tabela = e.currentTarget.closest(alvo);
        for (const caixa of tabela?.querySelectorAll<HTMLInputElement>(`input[form="${FORM_LOTE}"][name="ids"]`) ?? []) caixa.checked = e.currentTarget.checked;
        // O contador da barra ouve `change` no documento.
        document.dispatchEvent(new Event("change"));
      }}
    />
  );
}
