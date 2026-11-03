import assert from "node:assert/strict";
import { register } from "node:module";
import { beforeEach, describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import type { Cadastro } from "@/lib/apps";

type Banco = { apps: Record<string, object>; politicas: Record<string, object> };
const fixture = { banco: { apps: {}, politicas: {} } as Banco, erroPolitica: null as Error | null, prisma: {} as object };
function cliente(banco: Banco) {
  return {
    aplicacao: {
      create: async ({ data }: { data: Cadastro }) => { banco.apps[data.id] = structuredClone(data); },
      update: async ({ where, data }: { where: { id: string }; data: object }) => {
        assert.ok(banco.apps[where.id]);
        banco.apps[where.id] = { ...banco.apps[where.id], ...structuredClone(data) };
      },
    },
    politicaAplicacao: { upsert: async ({ where, create, update }: {
      where: { aplicacaoId: string }; create: object; update: object;
    }) => {
      if (fixture.erroPolitica) throw fixture.erroPolitica;
      banco.politicas[where.aplicacaoId] = banco.politicas[where.aplicacaoId]
        ? { ...banco.politicas[where.aplicacaoId], ...structuredClone(update) }
        : structuredClone(create);
    } },
  };
}
fixture.prisma = {
  aplicacao: {
    create: (args: { data: Cadastro }) => cliente(fixture.banco).aplicacao.create(args),
    update: (args: { where: { id: string }; data: object }) => cliente(fixture.banco).aplicacao.update(args),
  },
  politicaAplicacao: { upsert: (args: Parameters<ReturnType<typeof cliente>["politicaAplicacao"]["upsert"]>[0]) => cliente(fixture.banco).politicaAplicacao.upsert(args) },
  $transaction: async (executar: (tx: ReturnType<typeof cliente>) => Promise<void>) => {
    const rascunho = structuredClone(fixture.banco);
    await executar(cliente(rascunho));
    fixture.banco = rascunho;
  },
};
Object.assign(globalThis, { __cadastroTransacao: fixture });
const dataUrl = (source: string) => "data:text/javascript," + encodeURIComponent(source);
register(dataUrl(`
  const prisma = ${JSON.stringify(dataUrl("export const prisma = globalThis.__cadastroTransacao.prisma;"))};
  export function resolve(specifier, context, next) {
    if (specifier === '@/lib/prisma') return { url: prisma, shortCircuit: true };
    return next(specifier, context);
  }
`), import.meta.url);
const { criarCadastro, atualizarCadastro, salvarPoliticaAplicacao } = await import("@/lib/cadastro");
const dados: Cadastro = {
  id: "produto", nome: "Produto", host: "produto.example.test", tipo: "app", login: true,
  papelExigido: "ADMIN", restrito: false, exigeSegundoFator: true,
  dicaDominioGoogle: null, deepLink: null, repositorio: null, servidor: null,
  publicacao: null, situacao: "no_ar", observacao: null,
  politica: { modoAcesso: "equipe", exigeMfa: true, permiteCadastro: false, permiteRecuperacao: false, conviteObrigatorio: true, empresaObrigatoria: true },
};
const erroPrisma = (code: string) => new Prisma.PrismaClientKnownRequestError("Erro sintético ao persistir política", { code, clientVersion: Prisma.prismaVersion.client });
beforeEach(() => { fixture.banco = { apps: {}, politicas: {} }; fixture.erroPolitica = null; });

describe("catálogo e política como uma única gravação", () => {
  it("cria catálogo e todas as opções da política juntos com o mesmo autor", async () => {
    await criarCadastro(dados, "ADMIN@EXAMPLE.TEST");
    assert.equal((fixture.banco.apps.produto as Cadastro).nome, "Produto");
    assert.equal((fixture.banco.apps.produto as { atualizadoPor: string }).atualizadoPor, "admin@example.test");
    assert.equal("politica" in fixture.banco.apps.produto, false);
    assert.deepEqual(fixture.banco.politicas.produto, { aplicacaoId: "produto", ...dados.politica, atualizadoPor: "admin@example.test" });
  });
  for (const code of ["P2021", "P2022", "P2002", "P1001"]) {
    it(`não deixa aplicação órfã se a política falhar com ${code}`, async () => {
      fixture.erroPolitica = erroPrisma(code);
      await assert.rejects(criarCadastro(dados, "admin@example.test"), { code });
      assert.deepEqual(fixture.banco, { apps: {}, politicas: {} });
    });
    it(`preserva catálogo e política anteriores se a edição falhar com ${code}`, async () => {
      await criarCadastro(dados, "admin@example.test");
      const antes = structuredClone(fixture.banco);
      fixture.erroPolitica = erroPrisma(code);
      await assert.rejects(atualizarCadastro("produto", { ...dados, nome: "Alterado", politica: { ...dados.politica!, modoAcesso: "desativado" } }, "outro@example.test"), { code });
      assert.deepEqual(fixture.banco, antes);
    });
  }
  it("atualiza somente o ID carregado pelo servidor e preserva outra aplicação", async () => {
    await criarCadastro(dados, "admin@example.test");
    await criarCadastro({ ...dados, id: "outra" }, "admin@example.test");
    const outraAntes = structuredClone([fixture.banco.apps.outra, fixture.banco.politicas.outra]);
    await atualizarCadastro("produto", { ...dados, id: "outra", nome: "Atualizado" }, "novo@example.test");
    assert.equal((fixture.banco.apps.produto as Cadastro).id, "produto");
    assert.equal((fixture.banco.apps.produto as Cadastro).nome, "Atualizado");
    assert.deepEqual([fixture.banco.apps.outra, fixture.banco.politicas.outra], outraAntes);
    assert.deepEqual(fixture.banco.politicas.produto, { aplicacaoId: "produto", ...dados.politica, atualizadoPor: "novo@example.test" });
  });
  it("projeta a política legada na criação quando o chamador não a informa", async () => {
    const { politica: _, ...legado } = dados;
    await criarCadastro(legado, "admin@example.test");
    assert.equal((fixture.banco.politicas.produto as { modoAcesso: string }).modoAcesso, "equipe");
  });
  it("gravação direta de política também não ignora esquema ausente", async () => {
    fixture.erroPolitica = erroPrisma("P2021");
    await assert.rejects(salvarPoliticaAplicacao("produto", dados.politica!, "admin@example.test"), { code: "P2021" });
  });
});
