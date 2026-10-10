import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enderecoDaSecao, secaoDaConta } from "@/lib/secoesDaConta";

describe("seções de /conta", () => {
  it("sem parâmetro abre o início", () => {
    assert.equal(secaoDaConta(undefined), "inicio");
  });

  it("abre a seção pedida", () => {
    assert.equal(secaoDaConta("dados"), "dados");
    assert.equal(secaoDaConta("seguranca"), "seguranca");
  });

  it("valor desconhecido ou repetido cai no início", () => {
    assert.equal(secaoDaConta("admin"), "inicio");
    assert.equal(secaoDaConta(["dados", "seguranca"]), "inicio");
  });

  it("erro de vínculo abre a segurança, a não ser que a seção venha escrita", () => {
    assert.equal(secaoDaConta(undefined, "ja_usado"), "seguranca");
    assert.equal(secaoDaConta("dados", "ja_usado"), "dados");
  });

  it("o início não leva parâmetro no endereço", () => {
    assert.equal(enderecoDaSecao("inicio"), "/conta");
    assert.equal(enderecoDaSecao("seguranca"), "/conta?secao=seguranca");
  });
});
