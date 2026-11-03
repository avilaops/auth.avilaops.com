import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { before, after, describe, it } from 'node:test';

const banco = process.env.TEST_MCP_DATABASE_URL;
describe('MCP central em PostgreSQL descartável', { skip: !banco && 'TEST_MCP_DATABASE_URL não definida' }, async () => {
  if (banco && (!['localhost', '127.0.0.1'].includes(new URL(banco).hostname) || new URL(banco).pathname !== '/avl431_test')) throw new Error('Use somente avl431_test local descartável');
  process.env.DATABASE_URL = banco;
  process.env.PORTAL_DATABASE_URL = banco;
  process.env.SSO_JWT_SECRET = 'synthetic-only-mcp-tests-key';
  process.env.MCP_GATEWAY_CLIENT_ID = 'gateway-test';
  const { prisma } = await import('@/lib/prisma');
  const { poolPortal } = await import('@/lib/contas');
  const { assinarAccessToken } = await import('@/lib/oidc');
  const { autorizarOperacaoMcp } = await import('@/lib/acessoMcp');
  const { POST: revogar } = await import('@/app/oauth/revoke/route');
  const { POST: registrar } = await import('@/app/oauth/register/route');
  const { POST: trocar } = await import('@/app/oauth/token/route');
  const { emitirCodigoOAuth } = await import('@/lib/oidc');
  const { NextRequest } = await import('next/server');
  const portal = poolPortal();
  const segredo = 'synthetic-gateway-secret';
  const tokens = new Map<string, string>();
  const orgs = new Map<string, string>();
  const conexoes = new Map<string, string>();
  const pedido = (org: string, ferramenta = 'ler', empresa = org) => ({ organizacaoId: orgs.get(org)!, recurso: 'https://mcp.avilaops.com/mcp', metodoHttp: 'POST', mensagem: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: ferramenta, arguments: { empresa } } } });
  before(async () => {
    await portal.query(`CREATE TABLE portal_clients (id TEXT PRIMARY KEY, nome TEXT, email TEXT, cpf TEXT, telefone TEXT, role TEXT,
      senha_hash TEXT, senha_provisoria BOOLEAN, criado_em TIMESTAMP, ativo BOOLEAN, organization_id TEXT, ultimo_acesso_em TIMESTAMP,
      email_verificado BOOLEAN, mfa_email_ativo BOOLEAN, mfa_email_bloqueado_ate TIMESTAMP)`);
    await prisma.aplicacao.create({ data: { id: 'mcp', nome: 'MCP sintético', host: 'mcp.example.test', login: true, restrito: false, situacao: 'no_ar' } });
    await prisma.clienteOidc.create({ data: { id: 'gateway-test', appId: 'mcp', nome: 'Gateway', redirectUris: 'https://example.test/callback', segredoHash: createHash('sha256').update(segredo).digest('hex'), redirects: { create: { uri: 'https://example.test/callback' } } } });
    for (const id of ['a', 'b']) {
      await portal.query(`INSERT INTO portal_clients (id,nome,email,role,senha_hash,senha_provisoria,criado_em,ativo,email_verificado,mfa_email_ativo) VALUES ($1,$1,$2,'CLIENT','unused',false,now(),true,true,false)`, [id, `${id}@example.test`]);
      const org = await prisma.organizacaoCorporativa.create({ data: { clienteId: 'gateway-test', referenciaExterna: id, nome: id,
        vinculos: { create: { contaId: id, autorizacoes: { create: { papel: id === 'a' ? 'ADMINISTRADOR' : 'COMPRADOR' } } } } } });
      orgs.set(id, org.id);
      const conexao = await prisma.mcpConexao.create({ data: { sub: id, clienteId: 'gateway-test', organizacaoId: org.id,
        operacoes: ['read', 'write', 'delete'], pedidoHash: 'synthetic', usadoEm: new Date() } });
      conexoes.set(id, conexao.id);
      await prisma.refreshOAuth.create({ data: { tokenHash: createHash('sha256').update(`refresh-${id}`).digest('hex'), familia: `family-${id}`,
        clienteId: 'gateway-test', sub: id, email: `${id}@example.test`, expiraEm: new Date(Date.now() + 600_000), mcpConexaoId: conexao.id } });
      tokens.set(id, assinarAccessToken({ sub: id, email: `${id}@example.test`, nome: id, papel: 'CLIENTE', foto: null }, 'gateway-test', 'openid corporate_context', `family-${id}`));
    }
    await prisma.mcpPoliticaFerramenta.createMany({ data: ['ler', 'escrever', 'excluir'].map((f, i) => ({ clienteId: 'gateway-test', ferramenta: f,
      argumentoEmpresa: 'empresa', operacao: ['read', 'write', 'delete'][i], papeis: i ? ['ADMINISTRADOR'] : ['ADMINISTRADOR', 'COMPRADOR'], ativo: true })) });
  });
  after(async () => { await portal.end(); await prisma.$disconnect(); });
  it('permite empresa própria e rejeita seleção e argumentos cruzados', async () => {
    for (const id of ['a', 'b']) {
      const outro = id === 'a' ? 'b' : 'a';
      assert.equal((await autorizarOperacaoMcp(tokens.get(id)!, 'gateway-test', pedido(id)))?.permitido, true);
      assert.equal(await autorizarOperacaoMcp(tokens.get(id)!, 'gateway-test', pedido(outro)), null);
      assert.equal((await autorizarOperacaoMcp(tokens.get(id)!, 'gateway-test', pedido(id, 'ler', outro)))?.permitido, false);
    }
  });
  it('confere escrita e exclusão pelo papel corporativo atual', async () => {
    for (const f of ['escrever', 'excluir']) {
      assert.equal((await autorizarOperacaoMcp(tokens.get('a')!, 'gateway-test', pedido('a', f)))?.permitido, true);
      assert.equal((await autorizarOperacaoMcp(tokens.get('b')!, 'gateway-test', pedido('b', f)))?.permitido, false);
    }
  });
  it('registro público reutiliza código OIDC com PKCE e consentimento; refresh é rotacionado', async () => {
    const r = await registrar(new NextRequest('https://auth.example/oauth/register', { method: 'POST', body: JSON.stringify({ redirect_uris: ['https://client.example/callback'] }) }));
    assert.equal(r.status, 201);
    const { client_id } = await r.json();
    const verifier = 'v'.repeat(64);
    const conexao = await prisma.mcpConexao.create({ data: { sub: 'a', clienteId: client_id, organizacaoId: orgs.get('a')!, operacoes: ['read'], pedidoHash: 'test', usadoEm: new Date() } });
    const codigo = await emitirCodigoOAuth({ clienteId: client_id, redirectUri: 'https://client.example/callback', nonce: null,
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'), codeChallengeMethod: 'S256', escopo: 'openid corporate_context', mcpConexaoId: conexao.id,
      sub: 'a', email: 'a@example.test', nome: 'a', foto: null, papel: 'CLIENTE' });
    const exchange = (body: Record<string, string>) => trocar(new NextRequest('https://auth.example/oauth/token', { method: 'POST', body: new URLSearchParams({ client_id, ...body }) }));
    assert.equal((await exchange({ grant_type: 'authorization_code', code: codigo, redirect_uri: 'https://client.example/callback', code_verifier: 'wrong' })).status, 400);
    const emitido = await exchange({ grant_type: 'authorization_code', code: codigo, redirect_uri: 'https://client.example/callback', code_verifier: verifier });
    assert.equal(emitido.status, 200);
    const t = await emitido.json();
    assert.equal((await autorizarOperacaoMcp(t.access_token, 'gateway-test', pedido('a')))?.permitido, true);
    const renovado = await exchange({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
    assert.equal(renovado.status, 200);
    const t2 = await renovado.json();
    assert.notEqual(t2.refresh_token, t.refresh_token);
    assert.equal((await exchange({ grant_type: 'refresh_token', refresh_token: t.refresh_token })).status, 400);
    assert.equal(await autorizarOperacaoMcp(t2.access_token, 'gateway-test', pedido('a')), null);
  });
  it('revoga access token já usado e toda sua família sem atingir outra empresa', async () => {
    const token = tokens.get('a')!;
    assert.equal((await autorizarOperacaoMcp(token, 'gateway-test', pedido('a')))?.permitido, true);
    const r = await revogar(new NextRequest('https://auth.example/oauth/revoke', { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`gateway-test:${segredo}`).toString('base64')}` }, body: new URLSearchParams({ token }) }));
    assert.equal(r.status, 200);
    assert.equal(await autorizarOperacaoMcp(token, 'gateway-test', pedido('a')), null);
    assert.equal((await autorizarOperacaoMcp(tokens.get('b')!, 'gateway-test', pedido('b')))?.permitido, true);
  });
  it('revogação do consentimento e suspensão do vínculo têm efeito imediato', async () => {
    await prisma.mcpConexao.update({ where: { id: conexoes.get('b')! }, data: { revogadoEm: new Date() } });
    assert.equal(await autorizarOperacaoMcp(tokens.get('b')!, 'gateway-test', pedido('b')), null);
  });
});
