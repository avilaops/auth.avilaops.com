"use client";

import { useSyncExternalStore } from "react";
import { CHAVE_TEMA, EVENTO_TEMA, type PreferenciaTema } from "@/lib/tema-dispositivo";

function inscrever(notificar: () => void) {
  window.addEventListener(EVENTO_TEMA, notificar);
  window.addEventListener("storage", notificar);
  return () => {
    window.removeEventListener(EVENTO_TEMA, notificar);
    window.removeEventListener("storage", notificar);
  };
}

function lerPreferencia(): PreferenciaTema {
  const valor = document.documentElement.dataset.themePreference;
  return valor === "light" || valor === "dark" ? valor : "system";
}

const preferenciaInicial = () => "system" as const;

export default function ControleTema() {
  const preferencia = useSyncExternalStore(inscrever, lerPreferencia, preferenciaInicial);

  return (
    <select
      aria-label="Tema de aparência"
      className="controle-tema"
      value={preferencia}
      onChange={(evento) => {
        const valor = evento.currentTarget.value;
        try {
          if (valor === "system") localStorage.removeItem(CHAVE_TEMA);
          else localStorage.setItem(CHAVE_TEMA, valor);
        } catch {
          // A seleção ainda pode ser aplicada à página atual.
        }
        window.dispatchEvent(new CustomEvent(EVENTO_TEMA, { detail: valor }));
      }}
    >
      <option value="system">Sistema</option>
      <option value="light">Claro</option>
      <option value="dark">Escuro</option>
    </select>
  );
}
