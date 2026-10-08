"use client";

import { useState } from "react";

/**
 * Os códigos de recuperação, mostrados a única vez em que existem em claro.
 *
 * O botão de continuar só liga depois do "guardei": a lista aparece uma vez, e
 * quem fecha a aba sem copiar fica dependendo do painel para voltar a entrar
 * se perder o celular. O atrito aqui é de propósito.
 */
export default function CodigosRecuperacao({
  codigos,
  email,
  aoConfirmar,
  rotuloBotao = "Continuar",
}: {
  codigos: string[];
  email: string;
  aoConfirmar: () => void;
  rotuloBotao?: string;
}) {
  const [guardei, setGuardei] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const texto = [
    "Códigos de recuperação — Avila Ops",
    email,
    "",
    "Cada código entra uma vez, no lugar do aplicativo autenticador.",
    "Guarde longe do celular.",
    "",
    ...codigos,
  ].join("\n");

  function copiar() {
    navigator.clipboard.writeText(codigos.join("\n")).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  function baixar() {
    const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "codigos-recuperacao-avilaops.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-[var(--color-marca)]/40 bg-[var(--color-marca)]/10 p-4">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-sm">
          {codigos.map((c) => (
            <li key={c} className="select-all tracking-wide">{c}</li>
          ))}
        </ul>
      </div>

      <p className="text-xs leading-relaxed text-[var(--color-texto-fraco)]">
        Cada código entra <strong>uma vez</strong>, no lugar do aplicativo. É o que salva quem
        perdeu o celular. Guarde-os fora dele — gerenciador de senhas ou papel.
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copiar} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--color-borda)] px-4 py-2 text-sm hover:bg-[var(--color-fundo)]">
          {copiado ? "Copiado" : "Copiar"}
        </button>
        <button type="button" onClick={baixar} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--color-borda)] px-4 py-2 text-sm hover:bg-[var(--color-fundo)]">
          Baixar .txt
        </button>
      </div>

      <label className="flex items-start gap-2 text-xs text-[var(--color-texto-fraco)]">
        <input type="checkbox" checked={guardei} onChange={(e) => setGuardei(e.target.checked)} className="mt-0.5" />
        Guardei os códigos em lugar seguro.
      </label>

      <button
        type="button"
        disabled={!guardei}
        onClick={aoConfirmar}
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--color-marca-solida)] px-4 py-2.5 text-sm font-semibold text-[var(--color-marca-contraste)] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {rotuloBotao}
      </button>
    </div>
  );
}
