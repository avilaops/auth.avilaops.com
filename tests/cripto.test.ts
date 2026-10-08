import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { chaveConfigurada, cifrar, decifrar } from "@/lib/cripto";

const CHAVE = randomBytes(32).toString("hex");

/**
 * É esta cifra que faz um dump do banco não virar segundo fator de ninguém —
 * e nem os client secrets dos conectores.
 */
describe("segredos em repouso", () => {
  it("ida e volta", () => {
    process.env.AUTH_ENCRYPTION_KEY = CHAVE;
    const claro = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const cifrado = cifrar(claro);
    assert.notEqual(cifrado, claro);
    assert.ok(!cifrado.includes(claro), "o segredo não pode aparecer no texto cifrado");
    assert.equal(decifrar(cifrado), claro);
  });

  it("cifra o mesmo texto de formas diferentes (IV novo a cada vez)", () => {
    process.env.AUTH_ENCRYPTION_KEY = CHAVE;
    assert.notEqual(cifrar("igual"), cifrar("igual"));
  });

  it("recusa texto adulterado — é o GCM avisando, não decifrando lixo", () => {
    process.env.AUTH_ENCRYPTION_KEY = CHAVE;
    const [v, iv, tag, dados] = cifrar("segredo").split(":");
    const trocado = Buffer.from(dados, "base64");
    trocado[0] ^= 0xff;
    assert.throws(() => decifrar(`${v}:${iv}:${tag}:${trocado.toString("base64")}`));
  });

  it("não decifra com outra chave", () => {
    process.env.AUTH_ENCRYPTION_KEY = CHAVE;
    const cifrado = cifrar("segredo");
    process.env.AUTH_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    assert.throws(() => decifrar(cifrado));
  });

  it("recusa formato desconhecido", () => {
    process.env.AUTH_ENCRYPTION_KEY = CHAVE;
    assert.throws(() => decifrar("texto solto"), /formato desconhecido/);
  });

  it("reconhece chave ausente ou malformada", () => {
    delete process.env.AUTH_ENCRYPTION_KEY;
    assert.equal(chaveConfigurada(), false);
    process.env.AUTH_ENCRYPTION_KEY = "curta-demais";
    assert.equal(chaveConfigurada(), false);
    process.env.AUTH_ENCRYPTION_KEY = CHAVE;
    assert.equal(chaveConfigurada(), true);
  });
});
