import { listarEmpresas } from "@/lib/empresas";
import { acaoCriarAplicacao } from "../actions";
import { VoltarLista } from "../../_componentes/lista/Interativos";
import CamposAplicacao from "../CamposAplicacao";
import FormAcao from "../../_componentes/FormAcao";
import { botao, campo } from "../../_componentes/estilos";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nova aplicação" };

export default async function NovaAplicacaoPage() {
  const empresas = await listarEmpresas();
  return (
    <div className="mx-auto max-w-3xl">
      <VoltarLista secao="apps" base="/admin/apps">← Aplicações</VoltarLista>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight">Nova aplicação ou site</h1>
      <section className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
        <FormAcao acao={acaoCriarAplicacao}>
          <CamposAplicacao c={null} />
          {empresas.length > 0 && (
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Empresa responsável (opcional)
              <select name="empresa" defaultValue="" className={campo}>
                <option value="">Sem empresa vinculada</option>
                {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
              <span className="text-[11px]">Serve para filtrar e agrupar o painel; não muda quem pode entrar.</span>
            </label>
          )}
          <button type="submit" className={botao}>Cadastrar</button>
        </FormAcao>
      </section>
    </div>
  );
}
