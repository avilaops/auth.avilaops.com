"use client";

import { useId, useState } from "react";

/**
 * Campo de senha com o olho de "mostrar".
 *
 * Sem ele, quem digita uma senha provisoria longa (as que a Avila Ops entrega)
 * so descobre que errou uma letra depois do "login ou senha invalidos" — e nao
 * tem como distinguir erro de digitacao de senha errada de verdade.
 *
 * O botao fica DENTRO do campo, a direita, e nao entra na ordem de tabulacao
 * (`tabIndex={-1}`): quem navega pelo teclado espera que o Tab depois da senha
 * caia no botao de entrar, nao num controle visual.
 */

interface Props {
  value: string;
  onChange: (valor: string) => void;
  /** Rotulo acima do campo. */
  label: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export function CampoSenha({
  value,
  onChange,
  label,
  autoComplete = "current-password",
  minLength,
  required,
  className,
  autoFocus,
}: Props) {
  const [visivel, setVisivel] = useState(false);
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-[var(--color-texto-fraco)]">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visivel ? "text" : "password"}
          value={value}
          onChange={(evento) => onChange(evento.target.value)}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          autoFocus={autoFocus}
          className={
            className ??
            "w-full rounded-lg border border-[var(--color-borda)] bg-[var(--color-fundo)] py-2.5 pl-3 pr-11 text-sm outline-none focus:border-[var(--color-marca)]"
          }
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisivel((atual) => !atual)}
          aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visivel}
          title={visivel ? "Ocultar senha" : "Mostrar senha"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[var(--color-texto-fraco)] transition hover:text-[var(--color-texto)]"
        >
          {visivel ? (
            // Olho cortado: o traco diagonal e o unico sinal de "escondido" que
            // as pessoas leem sem pensar.
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
              <path d="M16.7 16.7A9.5 9.5 0 0 1 12 18c-5 0-9-6-9-6a17 17 0 0 1 4.1-4.7" />
              <path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c5 0 9 6 9 6a17.4 17.4 0 0 1-2.4 3.1" />
              <path d="m3 3 18 18" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
