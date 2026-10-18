import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

const URL_TESTE = process.env.TEST_DATABASE_URL;
const pular = !URL_TESTE;

describe("identidade corporativa no banco (precisa de TEST_DATABASE_URL)", { skip: pular ? "TEST_DATABASE_URL não definida" : false }, async () => {
  process.env.DATABASE_URL = URL_TESTE;
  process.env.PORTAL_DATABASE_URL = URL_TESTE;
  const { prisma } = await import("@/lib/prisma");
  const {
    alterarSituacaoDoVinculo,
    listarContextosCorporativos,
    provisionarContextoCorporativo,
  } = await import("@/lib/corporativo");
  process.env.SSO_JWT_SECRET = "segredo-de-teste-corporativo-com-32-caracteres";
  const { assinarAccessToken } = await import("@/lib/oidc");
  const { poolPortal } = await import("@/lib/contas");
  const { GET: consultarContextos } = await import("@/app/api/corporativo/contextos/route");
  const { NextRequest } = await import("next/server");

  const sufixo = randomUUID().slice(0, 8);
  const clienteA = `lojas-${sufixo}`;
  const clienteB = `crm-${sufixo}`;
  const conta = `conta-${sufixo}`;
  const contaEmail = `comprador-${sufixo}@example.com`;
  const portal = poolPortal();

  before(async () => {
    await portal.query(`CREATE TABLE IF NOT EXISTS portal_clients (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT NOT NULL,
      cpf TEXT,
      telefone TEXT,
      role TEXT NOT NULL,
      senha_hash TEXT NOT NULL,
      senha_provisoria BOOLEAN NOT NULL,
      criado_em TIMESTAMP NOT NULL,
      ativo BOOLEAN NOT NULL,
      organization_id TEXT,
      ultimo_acesso_em TIMESTAMP
    )`);
    await portal.query(
      `INSERT INTO portal_clients (id, nome, email, role, senha_hash, senha_provisoria, criado_em, ativo)
       VALUES ($1, 'Comprador', $2, 'CLIENT', 'teste', false, now(), true)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, ativo = true`,
      [conta, contaEmail],
    );
    await prisma.evento.deleteMany({ where: { autor: { in: [`app:${clienteA}`, `app:${clienteB}`] } } });
    await prisma.clienteOidc.createMany({
      data: [clienteA, clienteB].map((id) => ({ id, appId: id, nome: id, redirectUris: "", segredoHash: "00".repeat(32) })),
      skipDuplicates: true,
    });
  });

  after(async () => {
    const organizacoes = await prisma.organizacaoCorporativa.findMany({ where: { clienteId: { in: [clienteA, clienteB] } }, select: { id: true } });
    const ids = organizacoes.map((o) => o.id);
    const vinculos = await prisma.vinculoCorporativo.findMany({ where: { organizacaoId: { in: ids } }, select: { id: true } });
    await prisma.autorizacaoCorporativa.deleteMany({ where: { vinculoId: { in: vinculos.map((v) => v.id) } } });
    await prisma.vinculoCorporativo.deleteMany({ where: { organizacaoId: { in: ids } } });
    await prisma.unidadeCorporativa.deleteMany({ where: { organizacaoId: { in: ids } } });
    await prisma.organizacaoCorporativa.deleteMany({ where: { id: { in: ids } } });
    await prisma.evento.deleteMany({ where: { autor: { in: [`app:${clienteA}`, `app:${clienteB}`] } } });
    await prisma.clienteOidc.deleteMany({ where: { id: { in: [clienteA, clienteB] } } });
    await portal.query("DELETE FROM portal_clients WHERE id = $1", [conta]);
    await portal.end();
    await prisma.$disconnect();
  });

  it("provisionamento repetido não duplica organização, unidade, vínculo ou autorização", async () => {
    const entrada = {
      clienteId: clienteA,
      referenciaOrganizacao: "tenant-1",
      nomeOrganizacao: "Indústria Aurora",
      contaId: conta,
      contaEmail,
      convidadoPor: "dono@aurora.example",
      unidades: [{ referencia: "matriz", nome: "Matriz" }, { referencia: "filial-sp", nome: "Filial SP" }],
      autorizacoes: [
        { papel: "COMPRADOR" as const, referenciaUnidade: "matriz", limiteAprovacaoCentavos: null },
        { papel: "APROVADOR" as const, referenciaUnidade: "filial-sp", limiteAprovacaoCentavos: 150_000 },
      ],
      autor: `app:${clienteA}`,
    };
    const primeiro = await provisionarContextoCorporativo(entrada);
    const segundo = await provisionarContextoCorporativo(entrada);
    assert.equal(segundo.organizacaoId, primeiro.organizacaoId);
    assert.equal(segundo.vinculoId, primeiro.vinculoId);
    assert.deepEqual(
      await Promise.all([
        prisma.organizacaoCorporativa.count({ where: { clienteId: clienteA } }),
        prisma.unidadeCorporativa.count({ where: { organizacaoId: primeiro.organizacaoId } }),
        prisma.vinculoCorporativo.count({ where: { organizacaoId: primeiro.organizacaoId, contaId: conta } }),
        prisma.autorizacaoCorporativa.count({ where: { vinculoId: primeiro.vinculoId } }),
      ]),
      [1, 2, 1, 2],
    );
    assert.equal(segundo.versao, primeiro.versao);
  });

  it("uma conta participa de várias organizações e cada cliente enxerga somente as próprias", async () => {
    await provisionarContextoCorporativo({
      clienteId: clienteA,
      referenciaOrganizacao: "tenant-2",
      nomeOrganizacao: "Distribuidora Norte",
      contaId: conta,
      contaEmail,
      unidades: [],
      autorizacoes: [{ papel: "ADMINISTRADOR", referenciaUnidade: null, limiteAprovacaoCentavos: null }],
      autor: `app:${clienteA}`,
    });
    await provisionarContextoCorporativo({
      clienteId: clienteB,
      referenciaOrganizacao: "conta-crm-1",
      nomeOrganizacao: "Conta isolada no CRM",
      contaId: conta,
      contaEmail,
      unidades: [],
      autorizacoes: [{ papel: "VENDEDOR", referenciaUnidade: null, limiteAprovacaoCentavos: null }],
      autor: `app:${clienteB}`,
    });

    const contextosA = await listarContextosCorporativos(conta, clienteA);
    const contextosB = await listarContextosCorporativos(conta, clienteB);
    assert.deepEqual(contextosA.map((c) => c.referenciaExterna).sort(), ["tenant-1", "tenant-2"]);
    assert.deepEqual(contextosB.map((c) => c.referenciaExterna), ["conta-crm-1"]);
  });

  it("papel de unidade não vaza para a irmã e alçada organizacional vale sem unidade", async () => {
    const [contexto] = (await listarContextosCorporativos(conta, clienteA)).filter((c) => c.referenciaExterna === "tenant-1");
    assert.ok(contexto);
    const matriz = contexto.unidades.find((u) => u.referenciaExterna === "matriz");
    const filial = contexto.unidades.find((u) => u.referenciaExterna === "filial-sp");
    assert.deepEqual(matriz?.autorizacoes.map((a) => a.papel), ["COMPRADOR"]);
    assert.deepEqual(filial?.autorizacoes.map((a) => [a.papel, a.limiteAprovacaoCentavos]), [["APROVADOR", 150_000]]);
    assert.deepEqual(contexto.autorizacoesOrganizacao, []);
  });

  it("endpoint exige o escopo e revalida a integração antes de devolver o contexto", async () => {
    const identidade = { sub: conta, email: contaEmail, nome: "Comprador", foto: null, papel: "CLIENTE" as const };
    const semEscopo = await consultarContextos(new NextRequest("https://auth.avilaops.com/api/corporativo/contextos", {
      headers: { authorization: `Bearer ${assinarAccessToken(identidade, clienteA)}` },
    }));
    assert.equal(semEscopo.status, 403);

    const token = assinarAccessToken(identidade, clienteA, "openid profile email corporate_context");
    const autorizado = await consultarContextos(new NextRequest("https://auth.avilaops.com/api/corporativo/contextos", {
      headers: { authorization: `Bearer ${token}` },
    }));
    assert.equal(autorizado.status, 200);
    const corpo = await autorizado.json();
    assert.equal(corpo.contrato, "avila.corporativo.v1");
    assert.deepEqual(corpo.contextos.map((c: { referenciaExterna: string }) => c.referenciaExterna).sort(), ["tenant-1", "tenant-2"]);

    await prisma.clienteOidc.update({ where: { id: clienteA }, data: { ativo: false } });
    const desativado = await consultarContextos(new NextRequest("https://auth.avilaops.com/api/corporativo/contextos", {
      headers: { authorization: `Bearer ${token}` },
    }));
    assert.equal(desativado.status, 401);
    await prisma.clienteOidc.update({ where: { id: clienteA }, data: { ativo: true } });

    await portal.query("UPDATE portal_clients SET ativo = false WHERE id = $1", [conta]);
    const contaDesativada = await consultarContextos(new NextRequest("https://auth.avilaops.com/api/corporativo/contextos", {
      headers: { authorization: `Bearer ${token}` },
    }));
    assert.equal(contaDesativada.status, 401);
    await portal.query("UPDATE portal_clients SET ativo = true WHERE id = $1", [conta]);
  });

  it("suspensão e revogação somem da consulta imediatamente e deixam auditoria", async () => {
    assert.equal(await alterarSituacaoDoVinculo({ clienteId: clienteA, referenciaOrganizacao: "tenant-1", contaId: conta, contaEmail, situacao: "SUSPENSO", autor: `app:${clienteA}` }), true);
    assert.deepEqual((await listarContextosCorporativos(conta, clienteA)).map((c) => c.referenciaExterna), ["tenant-2"]);
    assert.equal(await alterarSituacaoDoVinculo({ clienteId: clienteA, referenciaOrganizacao: "tenant-1", contaId: conta, contaEmail, situacao: "REVOGADO", autor: `app:${clienteA}` }), true);
    const eventos = await prisma.evento.findMany({ where: { email: contaEmail, tipo: { in: ["vinculo_corporativo_suspenso", "vinculo_corporativo_revogado"] } }, orderBy: { criadoEm: "asc" } });
    assert.deepEqual(eventos.map((e) => e.tipo), ["vinculo_corporativo_suspenso", "vinculo_corporativo_revogado"]);
  });

  it("cliente diferente não altera organização alheia", async () => {
    assert.equal(await alterarSituacaoDoVinculo({ clienteId: clienteB, referenciaOrganizacao: "tenant-2", contaId: conta, contaEmail, situacao: "REVOGADO", autor: `app:${clienteB}` }), false);
    assert.equal((await listarContextosCorporativos(conta, clienteA)).some((c) => c.referenciaExterna === "tenant-2"), true);
  });
});
