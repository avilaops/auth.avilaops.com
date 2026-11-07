import { redirect } from 'next/navigation';
import { exigirAdmin, exigirAdminAction } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { buscarCliente } from '@/lib/oidc';
import { registrar } from '@/lib/eventos';

export const dynamic = 'force-dynamic';
async function salvar(form: FormData) {
  'use server';
  const admin = await exigirAdminAction();
  const clienteId = String(form.get('clienteId'));
  const cliente = await buscarCliente(clienteId);
  if (!cliente || cliente.appId !== 'mcp' || cliente.mcpGatewayId) throw new Error('Integração inválida');
  const ferramenta = String(form.get('ferramenta'));
  const operacao = String(form.get('operacao'));
  const papeis = form.getAll('papel').map(String);
  const argumentoEmpresa = String(form.get('argumentoEmpresa'));
  const argumentoUnidade = String(form.get('argumentoUnidade') ?? '') || null;
  const recurso = String(form.get('recurso'));
  if (!(process.env.MCP_RESOURCES ?? 'https://mcp.avilaops.com/mcp').split(',').map(s => s.trim()).includes(recurso)) throw new Error('Recurso inválido');
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(ferramenta) || !/^[a-zA-Z0-9_]{1,64}$/.test(argumentoEmpresa)
    || (argumentoUnidade && !/^[a-zA-Z0-9_]{1,64}$/.test(argumentoUnidade)) || !['read', 'write', 'delete'].includes(operacao)
    || !papeis.length || papeis.some(p => !['ADMINISTRADOR', 'COMPRADOR', 'APROVADOR', 'FINANCEIRO', 'VENDEDOR'].includes(p))) throw new Error('Política inválida');
  const data = { operacao, recurso, papeis, argumentoEmpresa, argumentoUnidade, ativo: form.get('ativo') === 'on' };
  await prisma.mcpPoliticaFerramenta.upsert({ where: { clienteId_ferramenta: { clienteId, ferramenta } }, create: { clienteId, ferramenta, ...data }, update: data });
  await registrar({ tipo: 'app_alterado', email: admin.email, appId: 'mcp', detalhe: `política MCP ${ferramenta} ${operacao}; ativa=${data.ativo}` });
  redirect('/admin/mcp');
}
export default async function Politicas() {
  await exigirAdmin('/admin/mcp');
  const politicas = await prisma.mcpPoliticaFerramenta.findMany({ orderBy: [{ clienteId: 'asc' }, { ferramenta: 'asc' }] });
  const clientes = await prisma.clienteOidc.findMany({ where: { appId: 'mcp', ativo: true } });
  return <main className="mx-auto max-w-3xl p-8"><h1 className="text-2xl font-semibold">Políticas do conector MCP</h1>
    <p>Ative somente ferramentas cujo backend confira a propriedade dos objetos pela empresa recebida do gateway.</p>
    <form action={salvar} className="my-6 grid gap-4">
      <label>Integração<select name="clienteId">{clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      <label>Ferramenta<input name="ferramenta" required /></label>
      <label>Recurso<input name="recurso" required defaultValue="https://mcp.avilaops.com/mcp" /></label>
      <label>Operação<select name="operacao"><option value="read">Leitura</option><option value="write">Escrita</option><option value="delete">Exclusão</option></select></label>
      <label>Campo da empresa<input name="argumentoEmpresa" required /></label><label>Campo da unidade<input name="argumentoUnidade" /></label>
      {['ADMINISTRADOR', 'COMPRADOR', 'APROVADOR', 'FINANCEIRO', 'VENDEDOR'].map(p => <label key={p}><input type="checkbox" name="papel" value={p} />{p}</label>)}
      <label><input type="checkbox" name="ativo" />Ativar</label><button>Salvar política central</button>
    </form>
    <table><thead><tr><th>Integração</th><th>Ferramenta</th><th>Operação</th><th>Situação</th></tr></thead><tbody>{politicas.map(p => <tr key={p.id}><td>{p.clienteId}</td><td>{p.ferramenta}</td><td>{p.operacao}</td><td>{p.ativo ? 'Ativa' : 'Inativa'}</td></tr>)}</tbody></table>
  </main>;
}
