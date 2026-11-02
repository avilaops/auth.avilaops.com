import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizarPolitica, politicaLegada } from "@/lib/politicaAplicacao";

const base = {
  tipo: "app" as const,
  login: true,
  situacao: "no_ar" as const,
  papelExigido: null,
  restrito: true,
  exigeSegundoFator: false,
};

describe("política central da aplicação", () => {
  it("projeta a regra legada sem abrir acesso", () => {
    assert.equal(politicaLegada(base).modoAcesso, "clientes_liberados");
    assert.equal(politicaLegada({ ...base, restrito: false }).modoAcesso, "qualquer_conta");
    assert.equal(politicaLegada({ ...base, papelExigido: "ADMIN" }).modoAcesso, "equipe");
    assert.equal(politicaLegada({ ...base, login: false }).modoAcesso, "desativado");
  });

  it("normaliza modo desconhecido para fechado", () => {
    assert.equal(normalizarPolitica({ modoAcesso: "qualquer-coisa" as never }).modoAcesso, "desativado");
    assert.equal(normalizarPolitica({ modoAcesso: "equipe", exigeMfa: true }).exigeMfa, true);
  });
});
