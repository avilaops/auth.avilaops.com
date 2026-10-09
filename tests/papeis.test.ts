import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { motivoDoAcesso, type AppRegistrado } from "@/lib/apps";
import { ehDaCasa, papelDaRole, papelValido, type Role } from "@/lib/contas";
import { politicaExige } from "@/lib/segundoFator";

/**
 * Papel, vínculo com empresa e autorização são três coisas. Estes testes fixam
 * a parte que errou em produção até 09/10/2026: o dono do negócio (role
 * `ADMIN`, um cliente) saía do login com sessão de equipe.
 */

const soEquipe: AppRegistrado = { id: "app", host: "app.avilaops.com", nome: "Operação", papelExigido: "ADMIN", restrito: false };
const restrito: AppRegistrado = { id: "tms", host: "tms.avilaops.com", nome: "TMS", papelExigido: null, restrito: true };
const aberto: AppRegistrado = { id: "mail", host: "mail.avilaops.com", nome: "Webmail", papelExigido: null, restrito: false };

/** O que o login decide para uma conta com este papel, com ou sem liberação explícita. */
const entra = (role: Role, app: AppRegistrado, liberado = false) => motivoDoAcesso(app, papelDaRole(role), liberado);

describe("quem é da casa", () => {
  it("só plataforma e sócio; dono do negócio e equipe dele são clientes", () => {
    assert.deepEqual((["OWNER", "SOCIO", "ADMIN", "CLIENT"] as const).map(ehDaCasa), [true, true, false, false]);
    assert.deepEqual((["OWNER", "SOCIO", "ADMIN", "CLIENT"] as const).map(papelDaRole), ["ADMIN", "ADMIN", "CLIENTE", "CLIENTE"]);
  });

  it("papel desconhecido vira o menos poderoso e sai como cliente", () => {
    assert.equal(papelDaRole(papelValido("SUPERADMIN")), "CLIENTE");
    assert.equal(papelDaRole(papelValido(null)), "CLIENTE");
    assert.equal(papelDaRole(papelValido("")), "CLIENTE");
  });
});

describe("aplicação só da equipe", () => {
  it("permite plataforma e sócio", () => {
    assert.equal(entra("OWNER", soEquipe), "equipe");
    assert.equal(entra("SOCIO", soEquipe), "equipe");
  });

  it("nega dono do negócio e equipe do cliente, mesmo com liberação explícita", () => {
    for (const role of ["ADMIN", "CLIENT"] as const) {
      assert.equal(entra(role, soEquipe), null, role);
      assert.equal(entra(role, soEquipe, true), null, `${role} com liberação`);
    }
  });
});

describe("aplicação restrita", () => {
  it("a equipe entra sem liberação", () => {
    assert.equal(entra("OWNER", restrito), "equipe");
    assert.equal(entra("SOCIO", restrito), "equipe");
  });

  it("dono do negócio e equipe do cliente só entram com liberação explícita", () => {
    for (const role of ["ADMIN", "CLIENT"] as const) {
      assert.equal(entra(role, restrito), null, `${role} sem liberação`);
      assert.equal(entra(role, restrito, true), "liberado", `${role} com liberação`);
    }
  });
});

describe("aplicação aberta", () => {
  it("todos entram, cada um pelo seu motivo", () => {
    assert.equal(entra("OWNER", aberto), "equipe");
    assert.equal(entra("ADMIN", aberto), "aberto");
    assert.equal(entra("CLIENT", aberto), "aberto");
  });
});

describe("o que acompanha a sessão de equipe", () => {
  it("segundo fator obrigatório da equipe não recai sobre o dono do negócio", () => {
    const antes = process.env.MFA_EQUIPE;
    delete process.env.MFA_EQUIPE;
    try {
      assert.equal(politicaExige({ papel: papelDaRole("OWNER") }), true);
      assert.equal(politicaExige({ papel: papelDaRole("SOCIO") }), true);
      assert.equal(politicaExige({ papel: papelDaRole("ADMIN") }), false);
      // Aplicação que exige o fator continua exigindo de qualquer papel.
      assert.equal(politicaExige({ papel: papelDaRole("ADMIN"), app: { ...aberto, exigeSegundoFator: true } }), true);
    } finally {
      if (antes === undefined) delete process.env.MFA_EQUIPE;
      else process.env.MFA_EQUIPE = antes;
    }
  });
});

describe("vínculo com empresa não é etiqueta", () => {
  it("para conta de cliente concede acesso, com o papel dentro da empresa derivado do papel da conta", async () => {
    const { efeitoDoVinculo } = await import("@/lib/vinculoEmpresa");
    assert.deepEqual([efeitoDoVinculo("ADMIN", true).concedeAcesso, efeitoDoVinculo("ADMIN", true).papelNaEmpresa], [true, "administrador"]);
    assert.deepEqual([efeitoDoVinculo("CLIENT", true).concedeAcesso, efeitoDoVinculo("CLIENT", true).papelNaEmpresa], [true, "membro"]);
    assert.equal(efeitoDoVinculo("CLIENT", false).suspensa, true);
  });

  it("para conta da casa não cria participação", async () => {
    const { efeitoDoVinculo } = await import("@/lib/vinculoEmpresa");
    for (const role of ["OWNER", "SOCIO"] as const) assert.deepEqual([efeitoDoVinculo(role, true).concedeAcesso, efeitoDoVinculo(role, true).papelNaEmpresa], [false, null]);
  });

  it("conceder, trocar e revogar pedem confirmação; não mudar nada, não", async () => {
    const { vinculoPrecisaDeConfirmacao } = await import("@/lib/vinculoEmpresa");
    assert.equal(vinculoPrecisaDeConfirmacao("ADMIN", null, "org1"), true);
    assert.equal(vinculoPrecisaDeConfirmacao("CLIENT", "org1", "org2"), true);
    assert.equal(vinculoPrecisaDeConfirmacao("CLIENT", "org1", null), true);
    assert.equal(vinculoPrecisaDeConfirmacao("CLIENT", "org1", "org1"), false);
    assert.equal(vinculoPrecisaDeConfirmacao("OWNER", null, "org1"), false);
  });
});
