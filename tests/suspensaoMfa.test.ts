import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suspensaoMfaAtiva } from "@/lib/suspensaoMfa";

const pessoa = { email: "dev@example.test", papel: "ADMIN" as const };
const inicio = Date.parse("2026-10-30T12:00:00Z");
const dados = { email: pessoa.email, inicio: "2026-10-30T12:00:00Z", fim: "2026-10-31T12:00:00Z", motivo: "Desenvolvimento acompanhado autorizado" };
const json = (mudancas = {}) => JSON.stringify({ ...dados, ...mudancas });

describe("suspensão temporária do segundo fator", () => {
  it("permite somente a conta ADMIN configurada dentro do prazo", () => {
    assert.equal(suspensaoMfaAtiva(pessoa, inicio, json())?.email, pessoa.email);
    assert.ok(suspensaoMfaAtiva({ ...pessoa, email: "DEV@EXAMPLE.TEST" }, inicio, json()));
    assert.equal(suspensaoMfaAtiva({ ...pessoa, email: "outra@example.test" }, inicio, json()), null);
    assert.equal(suspensaoMfaAtiva({ ...pessoa, email: "dev+outra@example.test" }, inicio, json()), null);
    assert.equal(suspensaoMfaAtiva({ ...pessoa, papel: "CLIENTE" }, inicio, json()), null);
  });

  it("volta à política normal no instante de expiração, sem reiniciar", () => {
    const fim = Date.parse(dados.fim);
    assert.equal(suspensaoMfaAtiva(pessoa, inicio - 1, json()), null);
    assert.ok(suspensaoMfaAtiva(pessoa, fim - 1, json()));
    assert.equal(suspensaoMfaAtiva(pessoa, fim, json()), null);
    assert.equal(suspensaoMfaAtiva(pessoa, fim + 1, json()), null);
    assert.equal(suspensaoMfaAtiva(pessoa, inicio, ""), null);
  });

  it("recusa janelas longas, datas inválidas, curingas e configuração malformada", () => {
    for (const valor of [
      "{", "null", "[]", json({ extra: true }), json({ email: "*@example.test" }),
      json({ fim: "2026-11-01T12:00:00Z" }), json({ fim: dados.inicio }),
      json({ inicio: "2026-02-31T12:00:00Z" }), json({ fim: "2026-10-31T12:00:00-03:00" }),
      json({ fim: 123 }), json({ motivo: "" }), json({ motivo: "motivo\ninválido" }), " ".repeat(1025),
    ]) assert.equal(suspensaoMfaAtiva(pessoa, inicio, valor), null, valor);
    assert.equal(suspensaoMfaAtiva(pessoa, Number.NaN, json()), null);
  });
});
