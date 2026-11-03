import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPedidoMcp, seloConsentimentoMcp, conferirConsentimentoMcp } from '@/lib/consentimentoMcp';
import { planejarImportacaoMcp, type SnapshotMcp, type MapaMcp } from '@/lib/importarMcpLegado';

test('consentimento é preso à conta, pedido e validade; parâmetros não podem ser trocados', () => {
  process.env.SSO_JWT_SECRET = 'synthetic-test-consent-key';
  const query = 'client_id=a&state=s&redirect_uri=https%3A%2F%2Fexample.test%2Fcallback';
  const expira = Date.now() + 300_000;
  const selo = seloConsentimentoMcp('sub-a', query, expira);
  assert.equal(conferirConsentimentoMcp('sub-a', query, expira, selo), true);
  assert.equal(conferirConsentimentoMcp('sub-b', query, expira, selo), false);
  assert.equal(conferirConsentimentoMcp('sub-a', query.replace('state=s', 'state=other'), expira, selo), false);
  assert.equal(conferirConsentimentoMcp('sub-a', query, Date.now() - 1, selo), false);
  assert.equal(hashPedidoMcp(query), hashPedidoMcp(`${query}&mcp_consent=ticket`));
});
test('migração exige mapeamento de cada família e preserva hashes, sujeitos e validade', () => {
  const agora = 1_700_000_000_000;
  const snapshot: SnapshotMcp = { clientes: [{ id: 'c', nome: 'Sintético', redirect_uris: '["https://example.test/callback"]' }], tokens: [
    { hash: 'a'.repeat(64), tipo: 'acesso', familia: 'f', cliente_id: 'c', recurso: null, sub: 'subject', expira_em: agora / 1000 + 60, usado: 0, criado_em: agora / 1000 - 10 },
    { hash: 'b'.repeat(64), tipo: 'renovacao', familia: 'f', cliente_id: 'c', recurso: null, sub: 'subject', expira_em: agora / 1000 + 600, usado: 0, criado_em: agora / 1000 - 10 },
  ] };
  const mapa: MapaMcp = [{ familia: 'f', organizacaoId: 'org', operacoes: ['read'], recurso: 'https://mcp.example/mcp' }];
  const antes = structuredClone(snapshot);
  assert.throws(() => planejarImportacaoMcp(snapshot, [], agora), /mapeamento/);
  assert.throws(() => planejarImportacaoMcp(snapshot, [...mapa, ...mapa], agora), /único/);
  const plano = planejarImportacaoMcp(snapshot, mapa, agora);
  assert.deepEqual(plano[0].tokens, snapshot.tokens);
  assert.deepEqual(snapshot, antes);
  assert.throws(() => planejarImportacaoMcp({ ...snapshot, tokens: snapshot.tokens.map((t, i) => i ? { ...t, sub: 'outra-conta' } : t) }, mapa, agora), /inconsistente/);
});
