import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { consultaEmpresasSql, idsEmpresasSelecionadas, lerConsultaEmpresas, lerPaginaOpcoes } from "@/lib/empresasConsulta";

describe("busca remota de empresas", () => {
  it("pede somente 25 opções e uma sentinela, mesmo em página profunda", () => {
    const sql = consultaEmpresasSql("ÁVILA indústria", 12000);
    assert.deepEqual(sql.valores, ["avila", "industria", 26, 299975]);
    assert.ok(sql.texto.includes("ORDER BY lower(name), id"));
    assert.ok(!sql.texto.includes("COUNT"));
  });

  it("parametriza texto literal, inclusive curingas e tentativa de SQL", () => {
    const sql = consultaEmpresasSql("%_' OR 1=1 --", 1);
    assert.ok(!sql.texto.includes("1=1"));
    assert.deepEqual(sql.valores, ["%_'", "or", "1=1", "--", 26, 0]);
  });

  it("valida paginação, comprimento e tamanho da busca antes do SQL", () => {
    for (const pag of ["-1", "0", "1.5", "NaN", "Infinity", "100001", "1e3", ""]) {
      assert.throws(() => lerConsultaEmpresas(new URLSearchParams({ pag })));
    }
    assert.throws(() => consultaEmpresasSql("x".repeat(121), 1));
    assert.deepEqual(lerConsultaEmpresas(new URLSearchParams()), { busca: "", pag: 1 });
  });

  it("limita seleções recebidas pela URL e mantém as de páginas distantes", () => {
    assert.deepEqual(idsEmpresasSelecionadas("sem,empresa-a,empresa-a,empresa-300000"), ["empresa-a", "empresa-300000"]);
    assert.deepEqual(idsEmpresasSelecionadas(["empresa-a", "ignorada"]), ["empresa-a"]);
    assert.deepEqual(idsEmpresasSelecionadas(undefined), []);
    assert.equal(idsEmpresasSelecionadas(Array.from({ length: 300_000 }, (_, i) => `empresa-${i}`).join(",")).length, 50);
    assert.deepEqual(idsEmpresasSelecionadas("'; DROP TABLE x,empresa-a"), ["empresa-a"]);
  });

  it("aceita uma página válida sem aceitar HTML, itens excessivos ou resposta velha", () => {
    const pagina = { opcoes: [{ valor: "empresa-a", rotulo: "Empresa A" }], pag: 2, temMais: false, disponivel: true };
    assert.deepEqual(lerPaginaOpcoes(pagina, 2), pagina);
    for (const valor of ["<html>Login</html>", null, { ...pagina, pag: 1 }, { ...pagina, temMais: "sim" },
      { ...pagina, opcoes: Array(26).fill(pagina.opcoes[0]) }, { ...pagina, opcoes: [pagina.opcoes[0], pagina.opcoes[0]] },
      { ...pagina, opcoes: [{ valor: "e", rotulo: null }] }]) {
      assert.throws(() => lerPaginaOpcoes(valor, 2));
    }
  });
});
