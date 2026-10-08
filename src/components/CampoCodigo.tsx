"use client";

import { useId } from "react";

/**
 * Campo do código de seis dígitos.
 *
 * `autoComplete="one-time-code"` é o que faz o iOS e o Android oferecerem o
 * código do aplicativo autenticador no teclado, sem alternar de app. O
 * `inputMode` numérico evita o teclado de letras num campo que só tem número —
 * mas o `type` continua texto porque o desafio também aceita código de
 * recuperação, que tem letras.
 */
export default function CampoCodigo({
  valor,
  aoMudar,
  rotulo = "Código de 6 dígitos",
  apenasDigitos = false,
  autoFocus = true,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  rotulo?: string;
  apenasDigitos?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--color-texto-fraco)]">{rotulo}</span>
      <input
        id={id}
        value={valor}
        onChange={(e) => aoMudar(apenasDigitos ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value)}
        inputMode={apenasDigitos ? "numeric" : "text"}
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        required
        spellCheck={false}
        placeholder={apenasDigitos ? "000000" : "000000 ou código de recuperação"}
        className="w-full rounded-lg border border-[var(--color-borda)] bg-[var(--color-fundo)] px-3 py-2.5 font-mono text-base tracking-[0.3em] outline-none placeholder:tracking-normal placeholder:font-sans placeholder:text-[var(--color-texto-fraco)] focus:border-[var(--color-marca)]"
      />
    </label>
  );
}
