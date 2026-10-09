import type { Empresa } from "@/lib/empresas";
import type { Resultado } from "../actions";
import FormAcao from "./FormAcao";
import { botaoFraco, campo } from "./estilos";

/**
 * Associação explícita de um registro a uma empresa.
 *
 * É o único lugar onde o vínculo nasce: as listagens só leem o que foi gravado
 * aqui. Mudar a empresa organiza o painel; não concede nem tira acesso.
 */
export default function VinculoEmpresa({
  acao,
  id,
  atual,
  empresas,
  explicacao,
}: {
  acao: (estado: Resultado | null, fd: FormData) => Promise<Resultado>;
  id: string;
  atual: string | null;
  empresas: Empresa[];
  explicacao: string;
}) {
  const orfa = atual && !empresas.some((e) => e.id === atual);
  return (
    <section className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-5">
      <h2 className="mb-1 text-sm font-semibold">Empresa</h2>
      <p className="mb-3 text-xs text-[var(--color-texto-fraco)]">{explicacao}</p>
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
          <button type="submit" className={`${botaoFraco} self-start`}>Salvar empresa</button>
        </FormAcao>
      )}
    </section>
  );
}
