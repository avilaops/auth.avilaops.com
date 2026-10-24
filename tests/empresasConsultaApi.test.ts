import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executarConsultaEmpresas } from "@/lib/empresasConsultaApi";
import type { Sessao } from "@/lib/sessao";

type Deps = Parameters<typeof executarConsultaEmpresas>[1];
const sessao = { sub: "conta", email: "admin@example.invalid", nome: "Admin", foto: null, papel: "ADMIN", mfa: false } as Sessao;
function preparar(sobrescrever: Partial<Deps> = {}) {
  const chamadas: string[] = [];
  const d: Deps = {
    sessao: async () => sessao,
    admin: () => true,
    precisaFator: async () => false,
    limitar: async (email) => { chamadas.push(`limite:${email}`); return true; },
    consultar: async (busca, pag) => { chamadas.push(`consulta:${busca}:${pag}`); return { opcoes: [], pag, disponivel: true, temMais: false }; },
    ...sobrescrever,
  };
  return { d, chamadas };
}

describe("autorização da busca de empresas", () => {
  it("recusa ausência de sessão sem tocar no banco, limite ou MFA", async () => {
    const { d, chamadas } = preparar({ sessao: async () => null, precisaFator: async () => { throw Error("não deve chamar"); } });
    assert.equal((await executarConsultaEmpresas(new URLSearchParams(), d)).status, 401);
    assert.deepEqual(chamadas, []);
  });
  it("recusa cliente/admin fora da lista antes de qualquer consulta", async () => {
    const { d, chamadas } = preparar({ admin: () => false, precisaFator: async () => { throw Error("não deve chamar"); } });
    assert.equal((await executarConsultaEmpresas(new URLSearchParams(), d)).status, 403);
    assert.deepEqual(chamadas, []);
  });
  it("exige elevação MFA quando o painel exigiria", async () => {
    const { d, chamadas } = preparar({ precisaFator: async () => true });
    assert.equal((await executarConsultaEmpresas(new URLSearchParams(), d)).status, 403);
    assert.deepEqual(chamadas, []);
  });
  it("MFA já conferido não precisa de novo desafio", async () => {
    const { d } = preparar({ sessao: async () => ({ ...sessao, mfa: true }), precisaFator: async () => { throw Error("não deve chamar"); } });
    assert.equal((await executarConsultaEmpresas(new URLSearchParams(), d)).status, 200);
  });
  it("rejeita parâmetros antes da leitura e aplica limite por conta", async () => {
    const { d, chamadas } = preparar();
    assert.equal((await executarConsultaEmpresas(new URLSearchParams({ pag: "NaN" }), d)).status, 400);
    assert.deepEqual(chamadas, []);
    d.limitar = async () => false;
    assert.equal((await executarConsultaEmpresas(new URLSearchParams(), d)).status, 429);
    assert.deepEqual(chamadas, []);
  });
  it("consulta só após os controles e não expõe falha interna", async () => {
    const { d, chamadas } = preparar();
    assert.equal((await executarConsultaEmpresas(new URLSearchParams({ q: "Empresa", pag: "2" }), d)).status, 200);
    assert.deepEqual(chamadas, ["limite:admin@example.invalid", "consulta:Empresa:2"]);
    d.consultar = async () => { throw Error("credencial-interna-nunca-expor"); };
    const r = await executarConsultaEmpresas(new URLSearchParams(), d);
    assert.equal(r.status, 503);
    assert.ok(!JSON.stringify(r).includes("credencial-interna"));
  });
});
