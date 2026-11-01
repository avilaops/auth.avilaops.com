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
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

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
  // O pacote do Next exporta este módulo com extensão; o resolvedor ESM cru
  // do Node não aplica o mesmo mapa que o bundler usa em produção.
  if (especificador === "next/server") {
    return proximo("next/server.js", contexto);
  }
  if (especificador.startsWith("@/")) {
    const base = RAIZ + especificador.slice(2);
    return proximo(base + (existsSync(new URL(base + ".ts")) ? ".ts" : ".tsx"), contexto);
  }
  return proximo(especificador, contexto);
}

/** Renderiza componentes reais nos testes de interface, sem servidor ou banco. */
export function load(url, contexto, proximo) {
  if (url.endsWith(".tsx")) {
    const { outputText } = ts.transpileModule(readFileSync(new URL(url), "utf8"), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    return { format: "module", source: outputText, shortCircuit: true };
  }
  return proximo(url, contexto);
}
