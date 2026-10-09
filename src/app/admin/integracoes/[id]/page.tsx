import Link from "next/link";
import { VoltarLista } from "../../_componentes/lista/Interativos";
import { notFound } from "next/navigation";
import { listarCadastro } from "@/lib/cadastro";
import { buscarIntegracao } from "@/lib/clientesOidc";
import FormAcao from "../../_componentes/FormAcao";
import { botao, botaoFraco, campo } from "../../_componentes/estilos";
import { acaoRemoverIntegracao, acaoSalvarIntegracao, acaoTrocarSegredoIntegracao } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integração" };

export default async function IntegracaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [i, apps] = await Promise.all([buscarIntegracao(id), listarCadastro()]);
  // Integração fixa do código não se edita aqui: o segredo dela está no .env.
  if (!i || i.origem !== "painel") notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <VoltarLista secao="integracoes" base="/admin/integracoes">← Integrações</VoltarLista>
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{i.nome}</h1>
        <code className="rounded bg-[var(--color-cartao)] px-2 py-0.5 text-xs">{i.id}</code>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-5">
          <h2 className="mb-4 text-sm font-semibold">Configuração</h2>
          <FormAcao acao={acaoSalvarIntegracao}>
            <input type="hidden" name="id" value={i.id} />
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Nome
              <input name="nome" required defaultValue={i.nome} className={campo} autoComplete="off" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Aplicação
              <select name="appId" required defaultValue={i.appId} className={campo}>
                {apps.map((a) => <option key={a.id} value={a.id}>{a.nome} ({a.id})</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Endereços de retorno (um por linha)
              <textarea name="redirectUris" rows={4} defaultValue={i.redirectUris.join("\n")} className={`${campo} font-mono text-xs`} />
            </label>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" name="acessoMeta" defaultChecked={i.acessoMeta} className="mt-0.5" />
              <span>Pode ler as conexões da Meta dos clientes</span>
            </label>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" name="ativo" defaultChecked={i.ativo} className="mt-0.5" />
              <span>Ativa<span className="block text-[11px] text-[var(--color-texto-fraco)]">Desmarcar recusa login e chamadas deste sistema na hora, sem apagar o cadastro.</span></span>
            </label>
            <button type="submit" className={botao}>Salvar</button>
          </FormAcao>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-5 text-xs">
            <div className="mb-2 font-semibold">Segredo</div>
            <p className="mb-3 text-[var(--color-texto-fraco)]">Só o hash fica guardado. Se o segredo se perdeu ou vazou, gere outro; o anterior para de valer na hora.</p>
            <FormAcao acao={acaoTrocarSegredoIntegracao}>
              <input type="hidden" name="id" value={i.id} />
              <button type="submit" className={botaoFraco}>Gerar segredo novo</button>
            </FormAcao>
          </div>

          <div className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-5 text-xs">
            <div className="mb-2 font-semibold">Remover</div>
            <p className="mb-3 text-[var(--color-texto-fraco)]">Apaga o cadastro. O sistema deixa de conseguir entrar por aqui.</p>
            <FormAcao acao={acaoRemoverIntegracao}>
              <input type="hidden" name="id" value={i.id} />
              <button type="submit" className={`${botaoFraco} text-[var(--color-marca-vermelho)]`}>Remover integração</button>
            </FormAcao>
          </div>

          {i.atualizadoEm && (
            <p className="text-[11px] text-[var(--color-texto-fraco)]">
              Atualizada {i.atualizadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} por {i.atualizadoPor ?? "—"}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
