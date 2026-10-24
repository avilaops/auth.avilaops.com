import { normalizar, pareceCpf, soDigitos, type Consulta } from "@/lib/listagem";

/** Campos que pertencem ao banco do portal, sem projetar MFA/auditoria. */
const ORDENS: Record<string, string> = {
  nome: "nullif(lower(regexp_replace(normalize(coalesce(nome, ''), NFD), U&'[\\0300-\\036f]', '', 'g')), '') COLLATE \"C\"",
  papel: "case role when 'OWNER' then 0 when 'SOCIO' then 1 when 'ADMIN' then 2 else 3 end",
  estado: "case when ativo then 0 else 1 end",
  criada: "criado_em",
};
const FILTROS = new Set(["empresa", "tipo", "papel", "estado", "senha"]);

export function podePaginarContasNoBanco(c: Consulta): boolean {
  return !c.grupo && Object.hasOwn(ORDENS, c.ord)
    && Object.entries(c.filtros).every(([k, v]) => !v.length || FILTROS.has(k));
}

/** Só valores viram parâmetros. Identificadores e direções vêm de listas fechadas. */
export function consultaContasSql(c: Consulta, busca: string) {
  if (!podePaginarContasNoBanco(c)) throw new Error("Consulta exige dados de outro banco ou agrupamento");
  if (![25, 50, 100].includes(c.por) || !Number.isSafeInteger(c.pag) || c.pag < 1 || c.pag > 100_000) {
    throw new Error("Página inválida");
  }
  if (c.dir !== "asc" && c.dir !== "desc") throw new Error("Direção inválida");
  const valores: unknown[] = [];
  const parametro = (valor: unknown) => { valores.push(valor); return `$${valores.length}`; };
  const condicoes: string[] = [];
  for (const [chave, pedidos] of Object.entries(c.filtros)) {
    if (!pedidos.length) continue;
    switch (chave) {
      case "empresa": {
        const ids = pedidos.filter((p) => p !== "sem");
        condicoes.push(`(organization_id::text = ANY(${parametro(ids)}::text[])${pedidos.includes("sem") ? " OR organization_id IS NULL" : ""})`);
        break;
      }
      case "papel":
        condicoes.push(`(case when role in ('OWNER', 'SOCIO', 'ADMIN', 'CLIENT') then role else 'CLIENT' end) = ANY(${parametro(pedidos)}::text[])`);
        break;
      case "tipo":
        condicoes.push(`(case when role in ('OWNER', 'SOCIO') then 'equipe' else 'cliente' end) = ANY(${parametro(pedidos)}::text[])`);
        break;
      case "estado":
        condicoes.push(`(case when ativo then 'ativa' else 'desligada' end) = ANY(${parametro(pedidos)}::text[])`);
        break;
      case "senha":
        condicoes.push(`(case when senha_provisoria then 'provisoria' else 'definida' end) = ANY(${parametro(pedidos)}::text[])`);
        break;
    }
  }
  if (pareceCpf(busca)) {
    const p = parametro(soDigitos(busca));
    condicoes.push(`(strpos(regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g'), ${p}) > 0 OR strpos(regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g'), ${p}) > 0)`);
  } else {
    for (const termo of normalizar(busca).split(/\s+/).filter(Boolean)) {
      const p = parametro(termo);
      // strpos mantém %, _ e barras como texto literal, como a busca antiga.
      condicoes.push(`strpos(lower(regexp_replace(normalize(coalesce(nome, '') || E'\\n' || coalesce(email, ''), NFD), U&'[\\0300-\\036f]', '', 'g')), ${p}) > 0`);
    }
  }
  return {
    onde: condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "",
    ordem: `${ORDENS[c.ord]} ${c.dir} NULLS LAST, id ASC`,
    valores,
  };
}
