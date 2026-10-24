import { normalizar, type OpcaoFiltro } from "@/lib/listagem";

export const EMPRESAS_POR_PAGINA = 25;
export const MAX_EMPRESAS_SELECIONADAS = 50;

/** Limita o que a URL pode pedir antes de consultar as opções selecionadas. */
export function idsEmpresasSelecionadas(valor: string | string[] | undefined): string[] {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return [...new Set((texto ?? "").slice(0, 7000).split(",").map((s) => s.trim())
    .filter((s) => s !== "sem" && /^[a-zA-Z0-9_-]{1,120}$/.test(s)))].slice(0, MAX_EMPRESAS_SELECIONADAS);
}

export function lerConsultaEmpresas(params: URLSearchParams) {
  const texto = params.get("pag") ?? "1";
  const pag = Number(texto);
  if (!/^\d+$/.test(texto) || !Number.isSafeInteger(pag) || pag < 1 || pag > 100_000) {
    throw new Error("Página inválida");
  }
  const busca = params.get("q") ?? "";
  if (busca.length > 120) throw new Error("Busca muito longa");
  return { busca: busca.trim(), pag };
}

export function consultaEmpresasSql(busca: string, pag: number) {
  // A mesma validação vale para chamadas internas, não só para a rota HTTP.
  const consulta = lerConsultaEmpresas(new URLSearchParams({ q: busca, pag: String(pag) }));
  const valores: unknown[] = [];
  const condicoes = normalizar(consulta.busca).split(/\s+/).filter(Boolean).map((termo) => {
    valores.push(termo);
    return `strpos(lower(regexp_replace(normalize(coalesce(name, ''), NFD), U&'[\\0300-\\036f]', '', 'g')), $${valores.length}) > 0`;
  });
  valores.push(EMPRESAS_POR_PAGINA + 1, (consulta.pag - 1) * EMPRESAS_POR_PAGINA);
  return {
    texto: `SELECT id, name, status FROM operations.organizations
      ${condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : ""}
      ORDER BY lower(name), id LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
    valores,
  };
}

export type PaginaOpcoes = { opcoes: OpcaoFiltro[]; pag: number; temMais: boolean; disponivel: boolean };

/** Valida a resposta antes de colocá-la no seletor. HTML de login não vira opção. */
export function lerPaginaOpcoes(valor: unknown, pagEsperada: number): PaginaOpcoes {
  const v = valor as Partial<PaginaOpcoes> | null;
  if (!v || v.pag !== pagEsperada || typeof v.temMais !== "boolean" || typeof v.disponivel !== "boolean"
    || !Array.isArray(v.opcoes) || v.opcoes.length > EMPRESAS_POR_PAGINA
    || v.opcoes.some((o) => !o || typeof o.valor !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(o.valor) || typeof o.rotulo !== "string" || o.rotulo.length > 1000)
    || new Set(v.opcoes.map((o) => o.valor)).size !== v.opcoes.length) {
    throw new Error("Resposta de empresas inválida");
  }
  return v as PaginaOpcoes;
}
