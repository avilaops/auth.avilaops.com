import assert from "node:assert/strict";
import { register } from "node:module";
import { beforeEach, describe, it } from "node:test";

type Destino = { clienteId: string; tipo: string; uri: string; ativo: boolean };
type Cliente = { id: string; nome: string; redirectUris: string; postLogoutRedirectUris?: string };
const fixture = {
  destinos: [] as Destino[],
  clientes: [] as Cliente[],
  erroLeitura: null as { code: string } | null,
  erroGravacao: null as { code: string } | null,
  transacoes: 0,
  prisma: {} as object,
};
const prisma = {
  redirectUri: {
    findMany: async ({ where }: { where: { clienteId: string; tipo: string; ativo: boolean } }) => {
      if (fixture.erroLeitura) throw fixture.erroLeitura;
      return fixture.destinos.filter(d => d.clienteId === where.clienteId && d.tipo === where.tipo && d.ativo === where.ativo);
    },
  },
  // Simula o isolamento transacional; nenhuma operação de escrita existe no cliente raiz.
  $transaction: async (executar: (tx: object) => Promise<void>) => {
    fixture.transacoes++;
    const clientes = structuredClone(fixture.clientes);
    let destinos = structuredClone(fixture.destinos);
    const tx = {
      clienteOidc: {
        create: async ({ data }: { data: Cliente }) => { clientes.push(data); },
        update: async ({ where, data }: { where: { id: string }; data: Partial<Cliente> }) => {
          const cliente = clientes.find(c => c.id === where.id);
          assert.ok(cliente);
          Object.assign(cliente, data);
        },
      },
      redirectUri: {
        deleteMany: async ({ where }: { where: { clienteId: string } }) => {
          destinos = destinos.filter(d => d.clienteId !== where.clienteId);
        },
        createMany: async ({ data }: { data: Omit<Destino, "ativo">[] }) => {
          if (fixture.erroGravacao) throw fixture.erroGravacao;
          for (const d of data) {
            if (!destinos.some(atual => atual.clienteId === d.clienteId && atual.tipo === d.tipo && atual.uri === d.uri)) destinos.push({ ...d, ativo: true });
          }
        },
      },
    };
    await executar(tx);
    fixture.clientes = clientes;
    fixture.destinos = destinos;
  },
};
fixture.prisma = prisma;
Object.assign(globalThis, { __redirectsOidcFixture: fixture });
const dataUrl = (source: string) => "data:text/javascript," + encodeURIComponent(source);
register(dataUrl(`
  const prisma = ${JSON.stringify(dataUrl("export const prisma = globalThis.__redirectsOidcFixture.prisma;"))};
  export function resolve(specifier, context, next) {
    if (specifier === '@/lib/prisma' || specifier.endsWith('/src/lib/prisma.ts')) return {url:prisma,shortCircuit:true};
    return next(specifier,context);
  }
`), import.meta.url);

const { destinosDoCliente } = await import("@/lib/redirectsOidc");
const { criarIntegracao, atualizarIntegracao } = await import("@/lib/clientesOidc");
const legado = "https://produto.example/antigo";
const entrada = {
  id: "produto", nome: "Produto", appId: "produto", ativo: true, acessoMeta: false,
  redirectUris: "https://produto.example/callback",
  postLogoutRedirectUris: "https://produto.example/saida",
};

beforeEach(() => {
  fixture.destinos = [];
  fixture.clientes = [];
  fixture.erroLeitura = null;
  fixture.erroGravacao = null;
  fixture.transacoes = 0;
});

describe("fonte central dos destinos OIDC", () => {
  it("não ressuscita redirect legado quando a tabela migrada está vazia", async () => {
    for (const tipo of ["authorization", "post_logout"]) {
      assert.deepEqual(await destinosDoCliente("produto", tipo, legado), []);
    }
  });

  it("respeita revogação e isola cliente e finalidade", async () => {
    fixture.destinos = [
      { clienteId: "produto", tipo: "authorization", uri: legado, ativo: false },
      { clienteId: "outro", tipo: "authorization", uri: "https://outro.example/callback", ativo: true },
      { clienteId: "produto", tipo: "post_logout", uri: entrada.postLogoutRedirectUris, ativo: true },
    ];
    assert.deepEqual(await destinosDoCliente("produto", "authorization", legado), []);
    assert.deepEqual(await destinosDoCliente("produto", "post_logout", legado), [entrada.postLogoutRedirectUris]);
  });

  it("limita compatibilidade de leitura a esquema ausente", async () => {
    for (const code of ["P2021", "P2022"]) {
      fixture.erroLeitura = { code };
      assert.deepEqual(await destinosDoCliente("produto", "authorization", legado), [legado]);
    }
    fixture.erroLeitura = { code: "P1001" };
    await assert.rejects(destinosDoCliente("produto", "authorization", legado), { code: "P1001" });
  });
});

describe("cadastro atômico de cliente e destinos", () => {
  it("cria cliente e os dois tipos de destino juntos", async () => {
    const segredo = await criarIntegracao(entrada, "admin@example.com");
    assert.ok(segredo.length > 32);
    assert.equal(fixture.transacoes, 1);
    assert.equal(fixture.clientes.length, 1);
    assert.deepEqual(fixture.destinos.map(d => [d.tipo, d.uri]), [
      ["authorization", entrada.redirectUris], ["post_logout", entrada.postLogoutRedirectUris],
    ]);
  });

  it("não deixa cliente criado quando a gravação dos destinos falha", async () => {
    for (const code of ["P2021", "P2022", "P1001"]) {
      fixture.erroGravacao = { code };
      await assert.rejects(criarIntegracao(entrada, "admin@example.com"), { code });
      assert.deepEqual(fixture.clientes, []);
      assert.deepEqual(fixture.destinos, []);
    }
  });

  it("preserva cliente e destinos anteriores quando a atualização falha", async () => {
    await criarIntegracao(entrada, "admin@example.com");
    const antes = structuredClone({ clientes: fixture.clientes, destinos: fixture.destinos });
    fixture.erroGravacao = { code: "P2002" };
    await assert.rejects(atualizarIntegracao(entrada.id, { ...entrada, nome: "Alterado", redirectUris: legado }, "admin@example.com"), { code: "P2002" });
    assert.deepEqual({ clientes: fixture.clientes, destinos: fixture.destinos }, antes);
  });

  it("remove destinos antigos sem afetar outro cliente e permite esvaziar pós-logout", async () => {
    await criarIntegracao(entrada, "admin@example.com");
    await criarIntegracao({ ...entrada, id: "outro" }, "admin@example.com");
    await atualizarIntegracao(entrada.id, { ...entrada, redirectUris: legado, postLogoutRedirectUris: "" }, "admin@example.com");
    assert.deepEqual(await destinosDoCliente("produto", "post_logout", entrada.postLogoutRedirectUris), []);
    assert.deepEqual(await destinosDoCliente("produto", "authorization", entrada.redirectUris), [legado]);
    assert.deepEqual(await destinosDoCliente("outro", "authorization", ""), [entrada.redirectUris]);
  });
});
