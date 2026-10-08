import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, it } from "node:test";

/**
 * Os testes do segundo fator que precisam de banco.
 *
 * Só rodam com `TEST_DATABASE_URL` apontando para um Postgres **descartável**,
 * com as migrações aplicadas. É de propósito que a variável não seja a
 * `DATABASE_URL` de sempre: este arquivo cria e apaga linhas, e não pode rodar
 * por acidente contra o banco onde estão os fatores de verdade da equipe.
 *
 *   createdb avilaops_auth_teste
 *   TEST_DATABASE_URL=postgresql://... npx prisma migrate deploy
 *   TEST_DATABASE_URL=postgresql://... npm test
 */
const URL_TESTE = process.env.TEST_DATABASE_URL;
const pular = !URL_TESTE;

const EMAIL = "teste-segundo-fator@avilaops.com";

describe("segundo fator (precisa de TEST_DATABASE_URL)", { skip: pular ? "TEST_DATABASE_URL não definida" : false }, async () => {
  process.env.DATABASE_URL = URL_TESTE;
  process.env.AUTH_ENCRYPTION_KEY ??= randomBytes(32).toString("hex");

  const { prisma } = await import("@/lib/prisma");
  const fator = await import("@/lib/segundoFator");
  const { codigoDoContador, contadorAgora } = await import("@/lib/totp");

  let segredo = "";
  let contador = 0;
  let codigos: string[] = [];

  before(async () => {
    await prisma.segundoFator.deleteMany({ where: { email: EMAIL } });
  });

  after(async () => {
    await prisma.segundoFator.deleteMany({ where: { email: EMAIL } });
    await prisma.$disconnect();
  });

  it("conta sem fator: equipe cadastra, cliente entra direto", async () => {
    assert.equal(await fator.desafioNecessario({ email: EMAIL, papel: "ADMIN" }), "cadastrar");
    assert.equal(await fator.desafioNecessario({ email: EMAIL, papel: "CLIENTE" }), "nenhum");
  });

  it("guarda o segredo cifrado, nunca em claro", async () => {
    const inicio = await fator.iniciarCadastro(EMAIL);
    segredo = inicio.segredo;
    assert.match(inicio.uri, /^otpauth:\/\/totp\//);

    const linha = await prisma.segundoFator.findUnique({ where: { email: EMAIL } });
    assert.ok(linha);
    assert.match(linha.segredoEnc, /^v1:/);
    assert.ok(!linha.segredoEnc.includes(segredo), "o segredo apareceu em claro no banco");
  });

  it("cadastro pendente não desafia e não tranca ninguém", async () => {
    assert.equal(await fator.desafioNecessario({ email: EMAIL, papel: "CLIENTE" }), "nenhum");
    assert.equal((await fator.estado(EMAIL)).ativo, false);
    assert.equal((await fator.estado(EMAIL)).pendente, true);
  });

  it("recarregar a tela do QR mantém o mesmo segredo", async () => {
    // Segredo novo a cada renderização invalidaria o QR que o aplicativo já leu.
    const outra = await fator.obterOuIniciarCadastro(EMAIL);
    assert.equal(outra.segredo, segredo);
  });

  it("código errado não confirma o cadastro", async () => {
    const r = await fator.confirmarCadastro(EMAIL, "000000");
    assert.equal(r.ok, false);
    assert.equal((await fator.estado(EMAIL)).ativo, false);
  });

  it("código certo confirma e entrega dez códigos de recuperação", async () => {
    contador = contadorAgora();
    const r = await fator.confirmarCadastro(EMAIL, codigoDoContador(segredo, contador));
    assert.ok(r.ok);
    codigos = r.ok ? r.codigos : [];
    assert.equal(codigos.length, 10);
    for (const c of codigos) assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.equal(new Set(codigos).size, 10);
  });

  it("fator ativo desafia qualquer papel, inclusive cliente", async () => {
    assert.equal(await fator.desafioNecessario({ email: EMAIL, papel: "CLIENTE" }), "verificar");
    const st = await fator.estado(EMAIL);
    assert.equal(st.ativo, true);
    assert.equal(st.codigosRestantes, 10);
  });

  it("o mesmo código não entra duas vezes", async () => {
    const r = await fator.verificar(EMAIL, codigoDoContador(segredo, contador));
    assert.equal(r.ok, false);
  });

  it("o código do intervalo seguinte entra", async () => {
    const r = await fator.verificar(EMAIL, codigoDoContador(segredo, contador + 1));
    assert.ok(r.ok);
    assert.equal(r.ok && r.via, "totp");
  });

  it("código anterior ao último aceito não entra", async () => {
    const r = await fator.verificar(EMAIL, codigoDoContador(segredo, contador));
    assert.equal(r.ok, false);
  });

  it("código de recuperação entra, queima e é aceito como a pessoa digita", async () => {
    const primeiro = await fator.verificar(EMAIL, codigos[0]);
    assert.ok(primeiro.ok);
    assert.equal(primeiro.ok && primeiro.via, "backup");
    assert.equal(primeiro.ok && primeiro.codigosRestantes, 9);

    const repetido = await fator.verificar(EMAIL, codigos[0]);
    assert.equal(repetido.ok, false, "código de recuperação foi aceito duas vezes");

    const bagunçado = await fator.verificar(EMAIL, ` ${codigos[1].toLowerCase().replace("-", "")} `);
    assert.ok(bagunçado.ok);
  });

  it("gerar códigos novos invalida a lista antiga", async () => {
    const novos = await fator.regenerarCodigos(EMAIL);
    assert.equal(novos.length, 10);
    assert.equal(novos.filter((c) => codigos.includes(c)).length, 0);
    assert.equal((await fator.verificar(EMAIL, codigos[5])).ok, false);
    assert.ok((await fator.verificar(EMAIL, novos[0])).ok);
  });

  it("diagnóstico enxerga o fator ativo quando o banco está migrado", async () => {
    const d = await fator.diagnosticar();
    assert.equal(d.migracoes, "aplicadas");
    assert.equal(d.chave, true);
    assert.equal(d.disponivel, true);
  });

  it("desativar leva os códigos junto", async () => {
    const linha = await prisma.segundoFator.findUnique({ where: { email: EMAIL } });
    assert.ok(linha);
    assert.equal(await fator.desativar(EMAIL), true);
    assert.equal((await fator.estado(EMAIL)).ativo, false);
    assert.equal(await prisma.codigoBackup.count({ where: { fatorId: linha.id } }), 0);
  });

  /**
   * O incidente de 19/09, travado em teste.
   *
   * O código subiu antes de `prisma migrate deploy`, e a consulta do fator
   * explodia (P2021) no meio da renderização do `/login`: quem tinha cookie de
   * sessão não conseguia entrar. A exigência de segurança derrubava a porta.
   *
   * Vem por último de propósito — derruba as tabelas do banco de teste, e o
   * módulo guarda a descoberta num sinalizador que vale pelo resto do processo.
   */
  it("migração pendente suspende o fator em vez de derrubar o login", async () => {
    await prisma.$executeRawUnsafe("drop table codigos_backup");
    await prisma.$executeRawUnsafe("drop table segundos_fatores");

    assert.equal(await fator.desafioNecessario({ email: EMAIL, papel: "ADMIN" }), "nenhum");
    assert.equal(await fator.desafioNecessario({ email: EMAIL, papel: "CLIENTE" }), "nenhum");
    assert.equal((await fator.estado(EMAIL)).ativo, false);
    assert.equal((await fator.ativosPorEmail()).size, 0);
    assert.equal(fator.exigeSegundoFator({ papel: "ADMIN" }), false);

    const d = await fator.diagnosticar();
    assert.equal(d.migracoes, "pendentes");
    assert.equal(d.disponivel, false);

    // E a suspensão fica na auditoria, que é o que impede o silêncio.
    const evento = await prisma.evento.findFirst({
      where: { tipo: "mfa_indisponivel" },
      orderBy: { criadoEm: "desc" },
    });
    assert.ok(evento, "a suspensão precisa deixar rastro em `eventos`");
    assert.match(evento.detalhe ?? "", /migrate deploy/);
  });
});
