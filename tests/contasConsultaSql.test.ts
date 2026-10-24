import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consultaContasSql, podePaginarContasNoBanco } from "@/lib/contasConsultaSql";
import { defContas } from "@/lib/contasLista";
import { lerConsulta } from "@/lib/listagem";

const consulta = (params: Record<string, string> = {}) => lerConsulta(params, defContas([]));

describe("consulta paginada das contas", () => {
  it("usa SQL para a consulta comum, mas nunca pagina antes dos filtros externos", () => {
    assert.equal(podePaginarContasNoBanco(consulta()), true);
    const externas: Record<string, string>[] = [{ f_fator: "com" }, { f_acesso: "nunca" }, { ord: "acesso" }, { ord: "empresa" }];
    for (const params of externas) {
      assert.equal(podePaginarContasNoBanco(consulta(params)), false);
      assert.throws(() => consultaContasSql(consulta(params), ""));
    }
  });

  it("agrupa somente os itens da página sem voltar ao caminho de cinco mil", () => {
    for (const grupo of ["empresa", "papel", "estado"]) {
      assert.equal(podePaginarContasNoBanco(consulta({ grupo })), true);
    }
    assert.equal(podePaginarContasNoBanco({ ...consulta(), grupo: "cpf" }), false);
    assert.equal(podePaginarContasNoBanco(consulta({ grupo: "estado", f_fator: "com" })), false);
  });

  it("parametriza busca e filtros, sem tratar curingas como busca parcial", () => {
    const c = consulta({ f_papel: "OWNER,CLIENT", f_estado: "ativa", f_senha: "provisoria", f_tipo: "cliente" });
    const sql = consultaContasSql(c, "JoÃO %_' OR 1=1 --");
    assert.ok(!sql.onde.includes("1=1"));
    assert.ok(sql.onde.includes("strpos("));
    assert.deepEqual(sql.valores.slice(4), ["joao", "%_'", "or", "1=1", "--"]);
    assert.ok(sql.ordem.endsWith('asc NULLS LAST, id ASC'));
  });

  it("empresa sem vínculo combina por OU com os IDs e o resto por E", () => {
    const c = { ...consulta(), filtros: { empresa: ["empresa-a", "sem"], estado: ["ativa"] } };
    const sql = consultaContasSql(c, "");
    assert.ok(sql.onde.includes("OR organization_id IS NULL) AND"));
    assert.deepEqual(sql.valores, [["empresa-a"], ["ativa"]]);
  });

  it("CPF e telefone são normalizados sem colocar o documento no SQL", () => {
    const sql = consultaContasSql(consulta(), "123.456.789-09");
    assert.deepEqual(sql.valores, ["12345678909"]);
    assert.ok(!sql.onde.includes("123456"));
    assert.ok(sql.onde.includes("telefone"));
  });

  it("rejeita identificador, direção, tamanho e página adulterados fora do parser", () => {
    for (const adulterada of [
      { ...consulta(), ord: "nome; DROP TABLE portal_clients" },
      { ...consulta(), dir: "desc; SELECT 1" },
      { ...consulta(), por: 300_000 },
      { ...consulta(), pag: NaN },
      { ...consulta(), pag: 1.5 },
      { ...consulta(), filtros: { desconhecido: ["valor"] } },
    ]) assert.throws(() => consultaContasSql(adulterada as ReturnType<typeof consulta>, ""));
  });

  it("a definição mantém as empresas independentemente da página exibida", () => {
    const def = defContas([{ id: "outra-pagina", nome: "Empresa", situacao: null }]);
    assert.equal(lerConsulta({ f_empresa: "outra-pagina" }, def).filtros.empresa[0], "outra-pagina");
  });
});
