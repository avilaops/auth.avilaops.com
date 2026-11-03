import { redirect } from 'next/navigation';
import { lerSessao } from '@/lib/sessao';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
async function revogar(form: FormData) {
  'use server';
  const sessao = await lerSessao();
  if (!sessao) throw new Error('Sem sessão');
  const id = String(form.get('id'));
  await prisma.$transaction(async tx => {
    const resultado = await tx.mcpConexao.updateMany({ where: { id, sub: sessao.sub, revogadoEm: null }, data: { revogadoEm: new Date() } });
    if (resultado.count) await tx.refreshOAuth.updateMany({ where: { mcpConexaoId: id, sub: sessao.sub }, data: { revogadoEm: new Date() } });
  });
  redirect('/conexoes');
}
export default async function Conexoes() {
  const sessao = await lerSessao();
  if (!sessao) redirect('/login?returnTo=/conexoes');
  const conexoes = await prisma.mcpConexao.findMany({ where: { sub: sessao.sub, revogadoEm: null, usadoEm: { not: null } }, orderBy: { criadoEm: 'desc' } });
  return <main className="mx-auto max-w-3xl p-8"><h1 className="text-2xl font-semibold">Conexões autorizadas</h1>
    {conexoes.map(c => <section className="my-4 rounded border p-4" key={c.id}><p>{c.clienteId}</p><p>Empresa: {c.organizacaoId} · {c.operacoes.join(', ')}</p>
      <form action={revogar}><input type="hidden" name="id" value={c.id} /><button>Revogar conexão e tokens</button></form></section>)}
    {!conexoes.length && <p>Nenhuma conexão ativa.</p>}
  </main>;
}

