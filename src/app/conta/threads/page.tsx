import Link from "next/link";
import { redirect } from "next/navigation";
import { buscarConta, ehDaCasa } from "@/lib/contas";
import { buscarThreadsDaConta } from "@/lib/conexaoThreads";
import { lerSessao } from "@/lib/sessao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conexão com o Threads" };
const data = (valor: Date) => valor.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function ContaThreadsPage() {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login?returnTo=/conta/threads");
  const conta = await buscarConta(sessao.sub);
  if (!conta?.ativa) redirect("/login?returnTo=/conta/threads");
  const [consulta] = await Promise.allSettled([buscarThreadsDaConta(conta.id)]);
  const indisponivel = consulta.status === "rejected";
  const conexao = consulta.status === "fulfilled" ? consulta.value : null;
  return <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
    <Link href="/conta" className="text-xs text-[var(--color-texto-fraco)]">← Minha conta</Link>
    <h1 className="mb-2 mt-4 text-2xl font-semibold">Threads da sua empresa</h1>
    <p className="mb-6 text-sm text-[var(--color-texto-fraco)]">Consulte a conta e as autorizações registradas para a empresa vinculada ao seu cadastro.</p>
    <section className="space-y-3 rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-5">
      {indisponivel ? <p role="alert">Não foi possível consultar a conexão. Tente novamente mais tarde.</p>
        : !conta.organizationId ? <p>Seu cadastro ainda não está vinculado a uma empresa. Solicite o vínculo à equipe responsável.</p>
        : !conexao ? <p>Nenhuma conta do Threads conectada à sua empresa.</p>
        : <>
          <h2 className="font-semibold">{conexao.nome ? `@${conexao.nome}` : "Conta Threads"}</h2>
          <p>{conexao.conectada ? "Autorização registrada e dentro da validade." : "A conexão precisa ser renovada."}</p>
          <dl className="space-y-2 text-sm">
            <div><dt>Publicação pelo Hub Social</dt><dd>{conexao.publicar ? "Autorizada" : "Não autorizada"}</dd></div>
            <div><dt>Consulta de resultados</dt><dd>{conexao.resultados ? "Autorizada" : "Não autorizada"}</dd></div>
            {conexao.expiraEm && <div><dt>Validade</dt><dd>{data(conexao.expiraEm)}</dd></div>}
            {conexao.conferidaEm && <div><dt>Última autorização registrada</dt><dd>{data(conexao.conferidaEm)}</dd></div>}
          </dl>
          <p className="text-xs text-[var(--color-texto-fraco)]">O acesso é conferido novamente ao executar uma operação no Threads.</p>
        </>}
      <p className="text-sm text-[var(--color-texto-fraco)]">A equipe responsável gerencia a conexão no Hub Social. Para conectar, renovar ou retirar o acesso da empresa, entre em contato com essa equipe.</p>
      {ehDaCasa(conta.role) && <a href="https://app.avilaops.com/hub-social/meta" target="_blank" rel="noopener noreferrer" className="inline-block text-sm underline">Abrir gerenciamento no Hub Social (nova aba)</a>}
    </section>
  </main>;
}
