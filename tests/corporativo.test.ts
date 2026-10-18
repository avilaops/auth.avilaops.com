import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  autorizacaoAlcancaUnidade,
  lerPedidoDeProvisionamentoCorporativo,
  normalizarAlcadaCentavos,
  normalizarPapelCorporativo,
  normalizarSituacaoCorporativa,
} from "@/lib/corporativo";

describe("contrato corporativo v1", () => {
  it("aceita somente os cinco papéis corporativos", () => {
    for (const papel of ["ADMINISTRADOR", "COMPRADOR", "APROVADOR", "FINANCEIRO", "VENDEDOR"] as const) {
      assert.equal(normalizarPapelCorporativo(papel), papel);
    }
    assert.equal(normalizarPapelCorporativo("OWNER"), null);
    assert.equal(normalizarPapelCorporativo("administrador"), null);
    assert.equal(normalizarPapelCorporativo(null), null);
  });

  it("aceita somente vínculo ativo, suspenso ou revogado", () => {
    assert.equal(normalizarSituacaoCorporativa("ATIVO"), "ATIVO");
    assert.equal(normalizarSituacaoCorporativa("SUSPENSO"), "SUSPENSO");
    assert.equal(normalizarSituacaoCorporativa("REVOGADO"), "REVOGADO");
    assert.equal(normalizarSituacaoCorporativa("PENDENTE"), null);
  });

  it("alçada é inteira não negativa em centavos ou ausente", () => {
    assert.equal(normalizarAlcadaCentavos(undefined), undefined);
    assert.equal(normalizarAlcadaCentavos(null), null);
    assert.equal(normalizarAlcadaCentavos(0), 0);
    assert.equal(normalizarAlcadaCentavos(150_000), 150_000);
    assert.equal(normalizarAlcadaCentavos(-1), undefined);
    assert.equal(normalizarAlcadaCentavos(1.5), undefined);
    assert.equal(normalizarAlcadaCentavos("100"), undefined);
  });

  it("escopo organizacional alcança todas as unidades; escopo de unidade só alcança a própria", () => {
    assert.equal(autorizacaoAlcancaUnidade({ unidadeId: null }, "unidade-a"), true);
    assert.equal(autorizacaoAlcancaUnidade({ unidadeId: "unidade-a" }, "unidade-a"), true);
    assert.equal(autorizacaoAlcancaUnidade({ unidadeId: "unidade-a" }, "unidade-b"), false);
    assert.equal(autorizacaoAlcancaUnidade({ unidadeId: "unidade-a" }, null), false);
  });

  it("lê o contrato HTTP v1 sem aceitar papel, unidade ou alçada implícitos", () => {
    assert.deepEqual(lerPedidoDeProvisionamentoCorporativo({
      versao: "avila.corporativo.v2",
      intencaoVersao: 7,
      organizacaoVersao: 11,
      email: " Compras@Aurora.Example ",
      organizacao: { referencia: " tenant-1 ", nome: " Indústria Aurora " },
      unidades: [{ referencia: " matriz ", nome: " Matriz " }],
      autorizacoes: [{ papel: "APROVADOR", referenciaUnidade: "matriz", limiteAprovacaoCentavos: 250_000 }],
      convidadoPor: "Dono da empresa",
    }), {
      contrato: "avila.corporativo.v2",
      email: "compras@aurora.example",
      intencaoVersao: 7,
      organizacaoVersao: 11,
      referenciaOrganizacao: "tenant-1",
      nomeOrganizacao: "Indústria Aurora",
      unidades: [{ referencia: "matriz", nome: "Matriz" }],
      autorizacoes: [{ papel: "APROVADOR", referenciaUnidade: "matriz", limiteAprovacaoCentavos: 250_000 }],
      convidadoPor: "Dono da empresa",
    });
    assert.deepEqual(lerPedidoDeProvisionamentoCorporativo({
      versao: "avila.corporativo.v1",
      email: "legado@aurora.example",
      organizacao: { referencia: "tenant-legado", nome: "Legado" },
      unidades: [],
      autorizacoes: [{ papel: "COMPRADOR", referenciaUnidade: null, limiteAprovacaoCentavos: null }],
    }), {
      contrato: "avila.corporativo.v1",
      email: "legado@aurora.example",
      intencaoVersao: null,
      organizacaoVersao: null,
      referenciaOrganizacao: "tenant-legado",
      nomeOrganizacao: "Legado",
      unidades: [],
      autorizacoes: [{ papel: "COMPRADOR", referenciaUnidade: null, limiteAprovacaoCentavos: null }],
      convidadoPor: null,
    });
    assert.equal(lerPedidoDeProvisionamentoCorporativo({ versao: "v2" }), null);
    assert.equal(lerPedidoDeProvisionamentoCorporativo({
      versao: "avila.corporativo.v2",
      intencaoVersao: 0,
      organizacaoVersao: 1,
      email: "a@b.com",
      organizacao: { referencia: "x", nome: "X" },
      unidades: [],
      autorizacoes: [{ papel: "COMPRADOR", referenciaUnidade: null, limiteAprovacaoCentavos: null }],
    }), null);
    assert.equal(lerPedidoDeProvisionamentoCorporativo({
      versao: "avila.corporativo.v2",
      intencaoVersao: 1,
      organizacaoVersao: 1,
      email: "a@b.com",
      organizacao: { referencia: "x", nome: "X" },
      unidades: [],
      autorizacoes: [{ papel: "OWNER", referenciaUnidade: null, limiteAprovacaoCentavos: null }],
    }), null);
    assert.equal(lerPedidoDeProvisionamentoCorporativo({
      versao: "avila.corporativo.v2",
      intencaoVersao: 1,
      organizacaoVersao: 1,
      email: "a@b.com",
      organizacao: { referencia: "x", nome: "X" },
      unidades: [],
      autorizacoes: [{ papel: "COMPRADOR", referenciaUnidade: "ausente", limiteAprovacaoCentavos: null }],
    }), null);
    assert.equal(lerPedidoDeProvisionamentoCorporativo({
      versao: "avila.corporativo.v2",
      intencaoVersao: 1,
      organizacaoVersao: 1,
      email: "a@b.com",
      organizacao: { referencia: "x", nome: "X" },
      unidades: [],
      autorizacoes: [{ papel: "APROVADOR", referenciaUnidade: null, limiteAprovacaoCentavos: -1 }],
    }), null);
    assert.equal(lerPedidoDeProvisionamentoCorporativo({
      versao: "avila.corporativo.v2",
      intencaoVersao: 1,
      organizacaoVersao: 1,
      email: "a@b.com",
      organizacao: { referencia: "x", nome: "X" },
      unidades: [{ referencia: "matriz", nome: "Matriz" }, { referencia: "matriz", nome: "Matriz repetida" }],
      autorizacoes: [{ papel: "COMPRADOR", referenciaUnidade: "matriz", limiteAprovacaoCentavos: null }],
    }), null);
    assert.equal(lerPedidoDeProvisionamentoCorporativo({
      versao: "avila.corporativo.v2",
      intencaoVersao: 1,
      organizacaoVersao: 1,
      email: "a@b.com",
      organizacao: { referencia: "x", nome: "X" },
      unidades: [],
      autorizacoes: [
        { papel: "COMPRADOR", referenciaUnidade: null, limiteAprovacaoCentavos: null },
        { papel: "COMPRADOR", referenciaUnidade: null, limiteAprovacaoCentavos: 1000 },
      ],
    }), null);
  });
});
