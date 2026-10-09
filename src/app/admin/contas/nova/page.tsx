import Link from "next/link";
import { dominiosHospedados } from "@/lib/caixaEmail";
import { listarEmpresas } from "@/lib/empresas";
import { VoltarLista } from "../../_componentes/lista/Interativos";
import { automacaoDeCaixaConfigurada } from "@/lib/caixaN8n";
import { acaoCriarConta } from "../../actions";
import CampoCaixa from "../../_componentes/CampoCaixa";
import FormAcao from "../../_componentes/FormAcao";
import { botao, campo } from "../../_componentes/estilos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova conta" };

export default async function NovaContaPage() {
  const [dominios, empresas] = await Promise.all([dominiosHospedados(), listarEmpresas()]);
  const automacao = automacaoDeCaixaConfigurada();

  return (
    <div className="mx-auto max-w-lg">
      <VoltarLista secao="contas" base="/admin">← Contas</VoltarLista>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight">Nova conta</h1>

      <div className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
        <FormAcao acao={acaoCriarConta}>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Nome
            <input name="nome" required className={campo} /></label>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">E-mail
            <input name="email" type="email" required className={campo} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">CPF (opcional)
              <input name="cpf" className={campo} /></label>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Telefone
              <input name="telefone" className={campo} /></label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Papel
            <select name="role" defaultValue="CLIENT" className={campo}>
              <option value="CLIENT">Equipe do cliente (usa o produto)</option>
              <option value="ADMIN">Dono do negócio (manda na própria empresa)</option>
              <option value="SOCIO">Sócio da Avila Ops (opera tudo, menos o caixa)</option>
              <option value="OWNER">Plataforma Avila Ops (acesso a tudo)</option>
            </select></label>
          {empresas.length > 0 && (
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Empresa (opcional)
              <select name="empresa" defaultValue="" className={campo}>
                <option value="">Sem empresa vinculada</option>
                {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
              <span className="text-[11px]">A empresa que a conta representa. Dá para mudar depois, na ficha.</span>
            </label>
          )}

          <fieldset className="flex flex-col gap-3 rounded-lg border border-[var(--color-borda)] p-3">
            <legend className="px-1 text-xs text-[var(--color-texto-fraco)]">Caixa de e-mail</legend>
            {dominios.length === 0 ? (
              <p className="text-xs text-amber-400">
                Sem domínios de e-mail disponíveis agora (banco do mail inacessível). A conta pode ser criada; a caixa fica para depois.
              </p>
            ) : (
              <>
                <CampoCaixa dominios={dominios} />
                <p className="text-xs text-[var(--color-texto-fraco)]">
                  A caixa nasce com a <strong>mesma senha provisória</strong> da conta (troca obrigatória no primeiro acesso) e a conta vira dona dela: abre em mail.avilaops.com pelo login único, sem digitar senha.
                  {!automacao && " Atenção: a automação (n8n) não está configurada neste ambiente; o pedido vai falhar."}
                </p>
              </>
            )}
          </fieldset>

          <p className="text-xs text-[var(--color-texto-fraco)]">
            A conta nasce com senha provisória gerada aqui; o usuário é obrigado a trocar no primeiro login.
          </p>
          <button type="submit" className={botao}>Criar conta</button>
        </FormAcao>
      </div>
    </div>
  );
}
