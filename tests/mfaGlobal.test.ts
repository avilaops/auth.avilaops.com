import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AppRegistrado } from "@/lib/apps";
import { desafioNecessario, mfaDisponivel, mfaHabilitado, politicaExige } from "@/lib/segundoFator";

describe("controle global do segundo fator", () => {
  it("desliga login e aplicativos sem consultar ou apagar o fator cadastrado", async () => {
    const anterior = process.env.MFA_HABILITADO;
    process.env.MFA_HABILITADO = "false";
    try {
      assert.equal(mfaHabilitado(), false);
      assert.equal(mfaDisponivel(), false);
      for (const papel of ["ADMIN", "CLIENTE"] as const) {
        const app = { exigeSegundoFator: true } as AppRegistrado;
        assert.equal(politicaExige({ papel, app }), false);
        // No database is configured: this must short-circuit before factor lookup.
        assert.equal(await desafioNecessario({ email: "account@example.test", papel, app }), "nenhum");
      }
    } finally {
      if (anterior === undefined) delete process.env.MFA_HABILITADO;
      else process.env.MFA_HABILITADO = anterior;
    }
  });

  it("preserva a política normal sem desativação explícita", () => {
    const anterior = process.env.MFA_HABILITADO;
    try {
      for (const value of [undefined, "true", "invalid", ""]) {
        if (value === undefined) delete process.env.MFA_HABILITADO;
        else process.env.MFA_HABILITADO = value;
        assert.equal(mfaHabilitado(), true);
        assert.equal(politicaExige({ papel: "CLIENTE", app: { exigeSegundoFator: true } as AppRegistrado }), true);
      }
    } finally {
      if (anterior === undefined) delete process.env.MFA_HABILITADO;
      else process.env.MFA_HABILITADO = anterior;
    }
  });
});
