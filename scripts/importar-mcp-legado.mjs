import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { importarMcpLegado } from '@/lib/importarMcpLegado';
import { prisma } from '@/lib/prisma';

// Rodar com o loader de aliases. Sem .env e sem DSN em saída.
const [sqlite, mapa, gateway, modo, aprovacao] = process.argv.slice(2);
if (!sqlite || !mapa || !gateway || (modo && modo !== '--apply') || (modo === '--apply' && !aprovacao)) {
  throw new Error('Uso: snapshot.sqlite mapa.json gateway-id [--apply referencia-aprovacao]');
}
const banco = new DatabaseSync(sqlite, { readOnly: true });
try {
  const snapshot = { clientes: banco.prepare('SELECT id,nome,redirect_uris FROM clientes').all(),
    tokens: banco.prepare('SELECT hash,tipo,familia,cliente_id,recurso,sub,expira_em,usado,criado_em FROM tokens').all() };
  console.log(JSON.stringify(await importarMcpLegado(snapshot, JSON.parse(await readFile(mapa, 'utf8')), gateway, modo === '--apply')));
} catch {
  console.error('Importação recusada. Conferir snapshot, mapeamento explícito e banco do Auth. Nenhuma credencial é registrada.');
  process.exitCode = 1;
} finally { banco.close(); await prisma.$disconnect(); }
