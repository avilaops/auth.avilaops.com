import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { buscarCliente, redirectUriValido } from '@/lib/oidc';
import { lerSessao } from '@/lib/sessao';
import { listarContextosCorporativos } from '@/lib/corporativo';
import { hashPedidoMcp, seloConsentimentoMcp, conferirConsentimentoMcp } from '@/lib/consentimentoMcp';
import { buscarApp } from '@/lib/cadastro';
import { buscarConta, papelDaRole } from '@/lib/contas';
import { podeEntrar } from '@/lib/permissoes';
import { desafioNecessario } from '@/lib/segundoFator';
import { prisma } from '@/lib/prisma';
import { baseUrl } from '@/lib/urls';

export const dynamic = 'force-dynamic';
async function contexto(query: string) {
  const sessao = await lerSessao();
  if (!sessao) redirect(`/login?returnTo=${encodeURIComponent(`/oauth/consentimento?q=${encodeURIComponent(query)}`)}`);
  const cliente = await buscarCliente(new URLSearchParams(query).get('client_id'));
  if (!process.env.MCP_GATEWAY_CLIENT_ID || !cliente || cliente.appId !== 'mcp'
    || !redirectUriValido(cliente, new URLSearchParams(query).get('redirect_uri'))) throw new Error('Pedido inválido');
  const conta = await buscarConta(sessao.sub);
  const app = await buscarApp('mcp');
  if (!conta?.ativa || !app || !(await podeEntrar(conta.email, papelDaRole(conta.role), app))) throw new Error('Sem acesso');
  if (!sessao.mfa && (await desafioNecessario({ email: conta.email, papel: papelDaRole(conta.role), app })) !== 'nenhum') {
    redirect(`/api/auth/mfa/elevar?app=mcp&returnTo=${encodeURIComponent(`/oauth/consentimento?q=${encodeURIComponent(query)}`)}`);
  }
  const contextos = await listarContextosCorporativos(sessao.sub, cliente.mcpGatewayId ?? cliente.id);
  return { sessao, cliente, contextos, expira: Date.now() + 600_000 };
}
async function consentir(form: FormData) {
  'use server';
  const h = await headers();
  if (h.get('origin') !== new URL(baseUrl()).origin) throw new Error('Origem inválida');
  const query = String(form.get('q') ?? '');
  const { sessao, cliente, contextos } = await contexto(query);
  if (!conferirConsentimentoMcp(sessao.sub, query, Number(form.get('expira')), String(form.get('selo')))) throw new Error('Pedido expirado');
  const q = new URLSearchParams(query);
  const destino = new URL(q.get('redirect_uri')!);
  if (form.get('decisao') !== 'permitir') {
    destino.searchParams.set('error', 'access_denied');
    if (q.get('state')) destino.searchParams.set('state', q.get('state')!);
    redirect(destino.toString());
  }
  const organizacaoId = String(form.get('organizacao'));
  const unidadeId = String(form.get('unidade') ?? '') || null;
  const org = contextos.find(c => c.organizacaoId === organizacaoId);
  if (!org || (unidadeId && !org.unidades.some(u => u.id === unidadeId))) throw new Error('Contexto inválido');
  const operacoes = form.getAll('operacao').map(String);
  if (!operacoes.length || operacoes.some(o => !['read', 'write', 'delete'].includes(o))) throw new Error('Consentimento inválido');
  const recurso = q.get('resource') ?? 'https://mcp.avilaops.com/mcp';
  const recursos = (process.env.MCP_RESOURCES ?? 'https://mcp.avilaops.com/mcp').split(',').map(s => s.trim());
  if (!recursos.includes(recurso)) throw new Error('Recurso inválido');
  const conexao = await prisma.mcpConexao.create({ data: { sub: sessao.sub, clienteId: cliente.id, organizacaoId, unidadeId,
    recurso, operacoes, pedidoHash: hashPedidoMcp(query) } });
  q.set('mcp_consent', conexao.id);
  redirect(`/oauth/authorize?${q}`);
}
export default async function Consentimento({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = (await searchParams).q ?? '';
  const { sessao, cliente, contextos, expira } = await contexto(query);
  return <main className="mx-auto max-w-xl p-8">
    <h1 className="text-2xl font-semibold">Autorizar {cliente.nome}</h1>
    <p>Escolha a empresa e as operações que este conector poderá solicitar. As permissões da sua conta continuam sendo verificadas a cada operação.</p>
    <form action={consentir} className="mt-6 grid gap-4">
      <input type="hidden" name="q" value={query} /><input type="hidden" name="expira" value={expira} />
      <input type="hidden" name="selo" value={seloConsentimentoMcp(sessao.sub, query, expira)} />
      <label>Empresa<select name="organizacao" required>{contextos.map(c => <option key={c.organizacaoId} value={c.organizacaoId}>{c.nome}</option>)}</select></label>
      <label>Unidade<select name="unidade"><option value="">Toda a organização, conforme suas permissões</option>{contextos.flatMap(c => c.unidades.map(u => <option key={u.id} value={u.id}>{c.nome} — {u.nome}</option>))}</select></label>
      <label><input name="operacao" type="checkbox" value="read" defaultChecked /> Leitura</label>
      <label><input name="operacao" type="checkbox" value="write" /> Escrita</label>
      <label><input name="operacao" type="checkbox" value="delete" /> Exclusão</label>
      <button name="decisao" value="permitir" disabled={!contextos.length}>Autorizar conexão</button>
      <button name="decisao" value="negar">Cancelar</button>
    </form>
  </main>;
}
