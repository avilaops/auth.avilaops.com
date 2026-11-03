import assert from "node:assert/strict";
import { register } from "node:module";
import { beforeEach, describe, it } from "node:test";
import { Prisma, type Aplicacao } from "@prisma/client";

type Linha = Aplicacao & { politica?: { modoAcesso: string; exigeMfa: boolean } };
const fixture = {
  linhas: [] as Linha[],
  erroPolitica: null as Error | null,
  erroCadastro: null as Error | null,
};

function erroPrisma(code: string) {
  return new Prisma.PrismaClientKnownRequestError("Falha sintética de leitura", {
    code, clientVersion: Prisma.prismaVersion.client,
  });
}

function linhasPersistidas(include?: { politica: boolean }) {
  const erro = include?.politica ? fixture.erroPolitica : fixture.erroCadastro;
  if (erro) throw erro;
  return fixture.linhas.map(({ politica, ...linha }) => include?.politica ? { ...linha, politica } : linha);
}

// Apenas a fronteira de banco é substituída. Cadastro, projeção da política e
// decisão de acesso abaixo são as implementações reais, sem conexão externa.
const prisma = {
  aplicacao: {
    findMany: async ({ include }: { include?: { politica: boolean } }) => linhasPersistidas(include),
    findUnique: async ({ where, include }: { where: { id: string }; include?: { politica: boolean } }) =>
      linhasPersistidas(include).find(linha => linha.id === where.id) ?? null,
  },
};
Object.assign(globalThis, { __cadastroPoliticaLegada: prisma });
const dataUrl = (source: string) => "data:text/javascript," + encodeURIComponent(source);
register(dataUrl(`
  const prisma = ${JSON.stringify(dataUrl("export const prisma = globalThis.__cadastroPoliticaLegada;"))};
  export function resolve(specifier, context, next) {
    if (specifier === '@/lib/prisma') return { url: prisma, shortCircuit: true };
    return next(specifier, context);
  }
`), import.meta.url);

const { buscarApp, buscarCadastro, listarApps, listarCadastro } = await import("@/lib/cadastro");
const { motivoDoAcesso } = await import("@/lib/apps");
const base: Aplicacao = {
  id: "crm", host: "crm.example.test", nome: "CRM persistido", tipo: "app", login: false,
  papelExigido: null, restrito: true, exigeSegundoFator: true,
  dicaDominioGoogle: null, deepLink: null, repositorio: null, servidor: null,
  publicacao: null, situacao: "no_ar", organizacaoId: null, observacao: null,
  criadoEm: new Date("2026-11-03T00:00:00Z"), atualizadoEm: new Date("2026-11-03T00:00:00Z"),
  atualizadoPor: null,
};

beforeEach(() => {
  fixture.linhas = [{ ...base }];
  fixture.erroPolitica = null;
  fixture.erroCadastro = null;
});

for (const code of ["P2021", "P2022"]) {
  describe(`cadastro persistido quando a relação de política falha com ${code}`, () => {
    beforeEach(() => { fixture.erroPolitica = erroPrisma(code); });

    it("não reativa o CRM desativado usando a lista de fábrica", async () => {
      assert.equal(await buscarApp("crm"), null);
      assert.deepEqual(await listarApps(), []);
      assert.equal((await buscarCadastro("crm"))?.nome, "CRM persistido");
    });

    it("preserva restrição, MFA e aplicação personalizada nas duas leituras", async () => {
      fixture.linhas = [{ ...base, id: "produto-privado", login: true }];
      const app = await buscarApp("produto-privado");
      assert.ok(app);
      assert.equal(app.host, "crm.example.test");
      assert.equal(app.restrito, true);
      assert.equal(app.exigeSegundoFator, true);
      assert.equal(motivoDoAcesso(app, "CLIENTE", false), null);
      assert.deepEqual((await listarCadastro()).map(c => [c.id, c.restrito, c.exigeSegundoFator]), [
        ["produto-privado", true, true],
      ]);
    });

    it("preserva aplicação exclusiva da equipe", async () => {
      fixture.linhas = [{ ...base, login: true, papelExigido: "ADMIN", restrito: false }];
      const app = await buscarApp("crm");
      assert.ok(app);
      assert.equal(app.papelExigido, "ADMIN");
      assert.equal(motivoDoAcesso(app, "CLIENTE", true), null);
      assert.equal((await listarApps())[0]?.papelExigido, "ADMIN");
    });

    it("não ressuscita aplicações removidas em catálogo existente vazio", async () => {
      fixture.linhas = [];
      assert.equal(await buscarCadastro("crm"), null);
      assert.deepEqual(await listarCadastro(), []);
    });

    it("propaga falha operacional da segunda leitura sem voltar à fábrica", async () => {
      const erro = erroPrisma("P1001");
      fixture.erroCadastro = erro;
      await assert.rejects(buscarCadastro("crm"), erro);
      await assert.rejects(listarCadastro(), erro);
    });
  });
}

describe("limites da compatibilidade de leitura", () => {
  it("prioriza política central disponível em relação aos campos legados", async () => {
    fixture.linhas = [{ ...base, login: true, restrito: false, politica: { modoAcesso: "equipe", exigeMfa: true } }];
    const app = await buscarApp("crm");
    assert.ok(app);
    assert.equal(app.papelExigido, "ADMIN");
    assert.equal(motivoDoAcesso(app, "CLIENTE", true), null);
    assert.equal((await listarApps())[0]?.papelExigido, "ADMIN");
  });

  it("mantém bootstrap de fábrica quando a própria tabela de aplicações está ausente", async () => {
    fixture.erroPolitica = erroPrisma("P2021");
    fixture.erroCadastro = erroPrisma("P2021");
    assert.equal((await buscarApp("crm"))?.host, "crm.avilaops.com");
    assert.ok((await listarCadastro()).some(c => c.id === "crm"));
  });

  it("não mascara indisponibilidade nem erros desconhecidos como ausência de esquema", async () => {
    for (const erro of [erroPrisma("P1001"), new Error("Erro desconhecido")]) {
      fixture.erroPolitica = erro;
      await assert.rejects(buscarCadastro("crm"), erro);
      await assert.rejects(listarCadastro(), erro);
    }
  });
});
