import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { motivoDaRecusa } from "@/lib/contas";

describe("recusa do banco ao remover conta, em palavras de tela", () => {
  it("participação em empresa", () => {
    assert.match(motivoDaRecusa("memberships_identity_id_fkey"), /participou de uma empresa/);
  });

  it("pedidos", () => {
    assert.match(motivoDaRecusa("portal_orders_client_id_fkey"), /tem pedidos/);
  });

  it("conexões autorizadas", () => {
    assert.match(motivoDaRecusa("connections_authorized_by_id_fkey"), /autorizou conexões/);
  });

  it("restrição desconhecida ou sem nome: mensagem geral, e sempre com o caminho de desligar", () => {
    for (const restricao of ["portal_client_scope_selections_client_id_fkey", undefined]) {
      const motivo = motivoDaRecusa(restricao);
      assert.match(motivo, /apontam para esta conta/);
      assert.match(motivo, /Desligue a conta/);
    }
  });
});
