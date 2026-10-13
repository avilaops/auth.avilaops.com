import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { describe, it } from "node:test";
import { autenticarDonoDeLoja, conferirSenhaDaLoja } from "@/lib/senhaDaLoja";

/** Exatamente o `gerarHashSenha` do Lojas (`src/lib/sessao.ts` de lá). */
function hashDoLojas(senha: string): string {
  const sal = randomBytes(16);
  return `scrypt.${sal.toString("base64url")}.${scryptSync(senha, sal, 64).toString("base64url")}`;
}

describe("senha da loja", () => {
  it("aceita a senha certa no formato que o cadastro do Lojas grava", async () => {
    const hash = hashDoLojas("senha-forte-1");
    assert.equal(await conferirSenhaDaLoja("senha-forte-1", hash), true);
    assert.equal(await conferirSenhaDaLoja("senha-errada-1", hash), false);
  });

  it("recusa o que não é scrypt do Lojas, sem lançar", async () => {
    for (const ruim of [null, "", "scrypt.", "scrypt.abc", "$2a$10$abcdefghijklmnopqrstuv", "bcrypt.a.b", "scrypt.a.b"]) {
      assert.equal(await conferirSenhaDaLoja("qualquer", ruim), false, String(ruim));
    }
  });

  it("fica desligado sem LOJAS_DATABASE_URL", async () => {
    delete process.env.LOJAS_DATABASE_URL;
    assert.equal(await autenticarDonoDeLoja("dono@exemplo.com", "senha-forte-1"), null);
  });
});
