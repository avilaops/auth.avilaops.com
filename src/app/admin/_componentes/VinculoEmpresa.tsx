import type { Empresa } from "@/lib/empresas";
import type { Resultado } from "../actions";
import FormAcao from "./FormAcao";
import { botaoFraco, campo } from "./estilos";

/**
 * Associação explícita de um registro a uma empresa.
 *
 * O efeito depende do que está sendo associado, e a tela diz qual é:
 *
 * - **aplicação**: só organiza o painel. Nenhum sistema lê esse campo para
 *   decidir acesso.
 * - **conta de cliente**: concede acesso aos dados da empresa no portal (ver
 *   `lib/vinculoEmpresa.ts`). Por isso vem com o aviso em `efeito` e uma
 *   confirmação obrigatória em `confirmacao`; a ação recusa sem ela.
 */
export default function VinculoEmpresa({
  acao,
  id,
  atual,
  empresas,
  explicacao,
  efeito,
  confirmacao,
  children,
}: {
  acao: (estado: Resultado | null, fd: FormData) => Promise<Resultado>;
  id: string;
  atual: string | null;
  empresas: Empresa[];
  explicacao: string;
  /** O que gravar este vínculo causa. Aparece em destaque quando concede acesso. */
  efeito?: { texto: string; concedeAcesso: boolean };
  /** Texto da caixa que a pessoa precisa marcar para gravar. */
  confirmacao?: string;
  /** Estado atual, somente leitura (participações em vigor, por exemplo). */
  children?: React.ReactNode;
}) {
  const orfa = atual && !empresas.some((e) => e.id === atual);
  return (
    <section className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-5">
      <h2 className="mb-1 text-sm font-semibold">Empresa</h2>
      <p className="mb-3 text-xs text-[var(--color-texto-fraco)]">{explicacao}</p>
      {children}
      {empresas.length === 0 ? (
        <p className="text-xs text-[var(--color-texto-fraco)]">Nenhuma empresa cadastrada no app.avilaops.com, ou este painel não consegue lê-las.</p>
      ) : (
        <FormAcao acao={acao}>
          <input type="hidden" name="id" value={id} />
          <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Empresa vinculada
            <select name="empresa" defaultValue={atual ?? ""} className={campo}>
              <option value="">Sem empresa vinculada</option>
              {orfa && <option value={atual}>Empresa não encontrada ({atual})</option>}
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </label>
          {efeito && (
            <p
              role="note"
              className={`rounded-lg border p-3 text-xs ${efeito.concedeAcesso ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-[var(--color-borda)] text-[var(--color-texto-fraco)]"}`}
            >
              {efeito.concedeAcesso && <strong className="block">Isto muda o acesso da conta.</strong>}
              {efeito.texto}
            </p>
          )}
          {confirmacao && (
            <label className="flex min-h-11 cursor-pointer items-start gap-2 text-xs">
              <input type="checkbox" name="confirmar" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{confirmacao}</span>
            </label>
          )}
          <button type="submit" className={`${botaoFraco} self-start`}>Salvar empresa</button>
        </FormAcao>
      )}
    </section>
  );
}
