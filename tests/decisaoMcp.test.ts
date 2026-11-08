import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decidirMcp, type ContextoMcp, type PoliticaFerramentaMcp } from '@/lib/decisaoMcp';

const empresa = (id: string, papel: string): ContextoMcp => ({ organizacaoId: id, referenciaExterna: `tenant-${id}`, autorizacoesOrganizacao: [{ papel }], unidades: [] });
const politicas: PoliticaFerramentaMcp[] = [
  { ferramenta: 'ler', operacao: 'read', argumentoEmpresa: 'empresa', argumentoUnidade: null, papeis: ['COMPRADOR', 'ADMINISTRADOR'] },
  { ferramenta: 'escrever', operacao: 'write', argumentoEmpresa: 'empresa', argumentoUnidade: null, papeis: ['ADMINISTRADOR'] },
  { ferramenta: 'excluir', operacao: 'delete', argumentoEmpresa: 'empresa', argumentoUnidade: null, papeis: ['ADMINISTRADOR'] },
];
const chamada = (organizacaoId: string, ferramenta: string, empresaId = organizacaoId) => ({ organizacaoId, metodoHttp: 'POST', mensagem: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: ferramenta, arguments: { empresa: `tenant-${empresaId}` } } } });
test('duas empresas: leitura própria, rejeição cruzada e escrita explícita', () => {
  for (const id of ['a', 'b']) {
    const contextos = [empresa(id, 'COMPRADOR')];
    assert.equal(decidirMcp(contextos, politicas, chamada(id, 'ler')).permitido, true);
    assert.equal(decidirMcp(contextos, politicas, chamada(id, 'escrever')).permitido, false);
    assert.equal(decidirMcp(contextos, politicas, chamada(id, 'excluir')).permitido, false);
    const outro = id === 'a' ? 'b' : 'a';
    assert.equal(decidirMcp(contextos, politicas, chamada(outro, 'ler')).permitido, false);
    assert.equal(decidirMcp(contextos, politicas, chamada(id, 'ler', outro)).permitido, false);
    assert.equal(decidirMcp([empresa(id, 'ADMINISTRADOR')], politicas, chamada(id, 'escrever')).permitido, true);
    assert.equal(decidirMcp([empresa(id, 'ADMINISTRADOR')], politicas, chamada(id, 'excluir')).permitido, true);
  }
});
test('suspensão, mudança de papel, ausência de política e batch negam na chamada seguinte', () => {
  assert.equal(decidirMcp([], politicas, chamada('a', 'ler')).permitido, false);
  assert.equal(decidirMcp([empresa('a', 'ADMIN')], politicas, chamada('a', 'ler')).permitido, false);
  assert.equal(decidirMcp([empresa('a', 'COMPRADOR')], [], chamada('a', 'ler')).permitido, false);
  assert.equal(decidirMcp([empresa('a', 'ADMINISTRADOR')], politicas, { ...chamada('a', 'ler'), mensagem: [chamada('a', 'ler').mensagem] }).permitido, false);
});
test('papéis de unidade não concedem escrita em outra unidade ou em toda organização', () => {
  const c = empresa('a', 'COMPRADOR');
  c.unidades = [{ id: 'matriz', referenciaExterna: 'm', autorizacoes: [{ papel: 'ADMINISTRADOR' }] }];
  const p = [{ ...politicas[1], argumentoUnidade: 'unidade' }];
  const pedido = chamada('a', 'escrever');
  Object.assign(pedido.mensagem.params.arguments, { unidade: 'm' });
  assert.equal(decidirMcp([c], p, pedido).permitido, false);
  assert.equal(decidirMcp([c], p, { ...pedido, unidadeId: 'matriz' }).permitido, true);
  assert.equal(decidirMcp([c], p, { ...pedido, unidadeId: 'filial' }).permitido, false);
});
