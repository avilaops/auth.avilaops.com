/**
 * Classes compartilhadas dos formulários do painel.
 *
 * Moram aqui, e não em `FormAcao.tsx`, porque aquele arquivo é de cliente
 * (`"use client"`): o que uma página de servidor importa de lá chega como
 * referência de cliente, não como texto. Passado direto em `className` ainda
 * funcionava; concatenado com outra classe virava a mensagem de erro do React
 * no lugar das classes, e o botão saía sem estilo — foi assim que
 * "+ Nova conta" ficou parecendo um link solto.
 */
export const campo =
  "min-h-11 w-full rounded-lg border border-[var(--color-borda)] bg-[var(--color-fundo)] px-3 py-2 text-sm outline-none focus:border-[var(--color-marca)]";
export const botao =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--color-marca-solida)] px-4 py-2 text-sm font-semibold text-[var(--color-marca-contraste)] hover:opacity-90 disabled:opacity-60";
export const botaoFraco =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--color-borda)] px-4 py-2 text-sm hover:bg-[var(--color-cartao)] disabled:opacity-60";
