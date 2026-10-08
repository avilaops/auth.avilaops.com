/**
 * Resolvedor dos testes.
 *
 * Duas traduções que o Node não faz sozinho:
 *
 * 1. `@/…` é o atalho do `tsconfig.json` para `src/…`. O Node não lê tsconfig.
 * 2. `next/headers` só existe dentro do servidor do Next. Os módulos testados
 *    aqui o importam para ler e gravar cookie, mas nenhum teste exercita isso —
 *    o que está sob teste é a assinatura dos tokens, não o cookie. Um esqueleto
 *    inofensivo no lugar mantém o teste hermético e sem subir um servidor.
 */
const RAIZ = new URL("../src/", import.meta.url).href;

const ESQUELETO_HEADERS =
  "data:text/javascript," +
  encodeURIComponent(
    "export const cookies = async () => ({ get: () => undefined, set: () => {}, delete: () => {} });" +
      "export const headers = async () => new Map();",
  );

export function resolve(especificador, contexto, proximo) {
  if (especificador === "next/headers") {
    return { url: ESQUELETO_HEADERS, shortCircuit: true };
  }
  if (especificador.startsWith("@/")) {
    return proximo(RAIZ + especificador.slice(2) + ".ts", contexto);
  }
  return proximo(especificador, contexto);
}
