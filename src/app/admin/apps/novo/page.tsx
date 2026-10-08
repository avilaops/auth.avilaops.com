import Link from "next/link";
import { acaoCriarAplicacao } from "../actions";
import CamposAplicacao from "../CamposAplicacao";
import FormAcao from "../../_componentes/FormAcao";
import { botao } from "../../_componentes/estilos";

export const metadata = { title: "Nova aplicação" };

export default function NovaAplicacaoPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/apps" className="text-xs text-[var(--color-texto-fraco)] hover:text-[var(--color-texto)]">← Aplicações</Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight">Nova aplicação ou site</h1>
      <section className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
        <FormAcao acao={acaoCriarAplicacao}>
          <CamposAplicacao c={null} />
          <button type="submit" className={botao}>Cadastrar</button>
        </FormAcao>
      </section>
    </div>
  );
}
