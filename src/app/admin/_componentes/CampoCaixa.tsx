"use client";

import { useState } from "react";
import { campo } from "./estilos";

/**
 * Domínio e usuário da caixa, juntos porque um explica o outro.
 *
 * O campo de usuário quer só a parte antes do @, mas sozinho ele parecia pedir
 * o endereço inteiro — quem digitava "news@avilaops.com" levava um erro de
 * formato sem entender o motivo. O sufixo à direita mostra o domínio
 * escolhido, então a frase que o campo forma já é o endereço final.
 */
export default function CampoCaixa({ dominios }: { dominios: string[] }) {
  const [dominio, setDominio] = useState("");

  return (
    <>
      <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">
        Criar caixa em
        <select
          name="caixaDominio"
          value={dominio}
          onChange={(e) => setDominio(e.target.value)}
          className={campo}
        >
          <option value="">Não criar caixa</option>
          {dominios.map((d) => (
            <option key={d} value={d}>
              @{d} {d === "avilaops.com" ? "— genérica Avila Ops" : "— empresarial"}
            </option>
          ))}
        </select>
      </label>

      {dominio ? (
        <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">
          Usuário da caixa (opcional)
          <span className="flex items-center gap-1">
            <input
              name="caixaUsuario"
              placeholder="contato"
              className={campo}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <span className="shrink-0">@{dominio}</span>
          </span>
          <span>Vazio usa o começo do e-mail da conta.</span>
        </label>
      ) : null}
    </>
  );
}
