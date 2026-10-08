import next from "eslint-config-next/core-web-vitals";

/**
 * Configuração do ESLint 9 (flat config).
 *
 * O `npm run lint` estava quebrado desde a subida para o ESLint 9: o pacote
 * deixou de procurar `.eslintrc.*` e o repositório nunca ganhou o arquivo novo,
 * então todo `lint` morria em "couldn't find a configuration file". Linter que
 * não roda é pior que linter ausente — ele consta no `package.json` e dá a
 * impressão de que alguém está conferindo.
 *
 * `eslint-config-next/core-web-vitals` já traz, em formato flat, o plugin do
 * Next, as regras de TypeScript e as de Core Web Vitals. Não há regra própria
 * da casa aqui de propósito: o padrão do Next é o que o time conhece, e regra
 * inventada sem motivo vira ruído no diff de todo mundo.
 */
const config = [
  ...next,
  {
    // Saída de build e tipos gerados não são código que alguém escreveu.
    ignores: [".next/**", "out/**", "next-env.d.ts", "src/generated/**"],
  },
];

export default config;
