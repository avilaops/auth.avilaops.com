import Link from "next/link";
import { listarEventos } from "@/lib/eventos";
import { campo } from "../_componentes/estilos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atividade" };

type Tom = "bom" | "ruim" | "atencao" | "neutro";

/**
 * Nome que uma pessoa lê, no lugar do código gravado no banco (`login_ok`,
 * `conector_alterado`). O código continua no `title`, para quem for procurar
 * no log. Tipo novo sem entrada aqui aparece com o próprio código.
 */
const EVENTO: Record<string, { rotulo: string; tom: Tom }> = {
  login_ok: { rotulo: "Entrou", tom: "bom" },
  login_falhou: { rotulo: "Login falhou", tom: "ruim" },
  login_sem_permissao: { rotulo: "Login sem permissão", tom: "atencao" },
  logout: { rotulo: "Saiu", tom: "neutro" },
  senha_trocada: { rotulo: "Trocou a senha", tom: "neutro" },
  senha_redefinida: { rotulo: "Senha redefinida", tom: "atencao" },
  recuperacao_emitida: { rotulo: "Link de recuperação emitido", tom: "neutro" },
  recuperacao_usada: { rotulo: "Link de recuperação usado", tom: "neutro" },
  conta_criada: { rotulo: "Conta criada", tom: "bom" },
  conta_editada: { rotulo: "Conta editada", tom: "neutro" },
  conta_removida: { rotulo: "Conta removida", tom: "ruim" },
  permissao_concedida: { rotulo: "Permissão concedida", tom: "bom" },
  permissao_revogada: { rotulo: "Permissão revogada", tom: "atencao" },
  vinculo_criado: { rotulo: "Login social vinculado", tom: "neutro" },
  vinculo_removido: { rotulo: "Login social desvinculado", tom: "neutro" },
  conector_alterado: { rotulo: "Conector alterado", tom: "neutro" },
  app_criado: { rotulo: "Aplicação criada", tom: "neutro" },
  app_alterado: { rotulo: "Aplicação alterada", tom: "neutro" },
  app_removido: { rotulo: "Aplicação removida", tom: "ruim" },
  meta_conectada: { rotulo: "Meta conectada", tom: "bom" },
  meta_desconectada: { rotulo: "Meta desconectada", tom: "neutro" },
  meta_falhou: { rotulo: "Conexão com a Meta falhou", tom: "ruim" },
  meta_dados_excluidos: { rotulo: "Dados da Meta excluídos", tom: "atencao" },
  meta_token_entregue: { rotulo: "Token da Meta entregue a um sistema", tom: "atencao" },
  meta_token_renovado: { rotulo: "Token da Meta renovado", tom: "neutro" },
  integracao_criada: { rotulo: "Integração criada", tom: "neutro" },
  integracao_alterada: { rotulo: "Integração alterada", tom: "neutro" },
  integracao_segredo_trocado: { rotulo: "Segredo de integração trocado", tom: "atencao" },
  integracao_removida: { rotulo: "Integração removida", tom: "ruim" },
  caixa_criada: { rotulo: "Caixa de e-mail criada", tom: "bom" },
  caixa_falhou: { rotulo: "Caixa de e-mail falhou", tom: "ruim" },
  mfa_ativado: { rotulo: "2FA ativada", tom: "bom" },
  mfa_desativado: { rotulo: "2FA desativada", tom: "atencao" },
  mfa_resetado: { rotulo: "2FA redefinida", tom: "atencao" },
  mfa_desafiado: { rotulo: "2FA pedida", tom: "neutro" },
  mfa_cadastro_exigido: { rotulo: "Cadastro de 2FA exigido", tom: "neutro" },
  mfa_ok: { rotulo: "2FA conferida", tom: "bom" },
  mfa_falhou: { rotulo: "2FA falhou", tom: "ruim" },
  mfa_backup_usado: { rotulo: "Código de recuperação usado", tom: "atencao" },
  mfa_codigos_gerados: { rotulo: "Códigos de recuperação gerados", tom: "neutro" },
  mfa_indisponivel: { rotulo: "2FA indisponível", tom: "ruim" },
};

const PONTO: Record<Tom, string> = {
  bom: "bg-emerald-400",
  ruim: "bg-red-400",
  atencao: "bg-amber-400",
  neutro: "bg-[var(--color-texto-apagado)]",
};

const POR_PAGINA = 100;

function dataValida(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function EventosPage({ searchParams }: { searchParams: Promise<{ email?: string; tipo?: string; antes?: string }> }) {
  const { email, tipo, antes } = await searchParams;
  const tipoValido = tipo && EVENTO[tipo] ? tipo : undefined;
  const corte = dataValida(antes);
  // Um a mais que a página: é como se sabe que existe uma próxima sem contar a tabela.
  const linhas = await listarEventos({ email: email || undefined, tipo: tipoValido, antes: corte, limite: POR_PAGINA + 1 });
  const eventos = linhas.slice(0, POR_PAGINA);
  const temMais = linhas.length > POR_PAGINA;
  const filtrado = Boolean(email || tipoValido || corte);

  const proxima = new URLSearchParams();
  if (email) proxima.set("email", email);
  if (tipoValido) proxima.set("tipo", tipoValido);
  if (eventos.length > 0) proxima.set("antes", eventos[eventos.length - 1].criadoEm.toISOString());

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">Atividade</h1>
      <p className="mt-1 mb-5 text-sm text-[var(--color-texto-fraco)]">
        Logins, falhas, trocas de senha e ações do painel, do mais recente para o mais antigo.
      </p>

      <form className="mb-4 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="filtro-email">Filtrar por e-mail</label>
        <input id="filtro-email" name="email" type="search" defaultValue={email ?? ""} placeholder="Filtrar por e-mail" className={`${campo} min-w-0 flex-1 basis-56`} />
        <label className="sr-only" htmlFor="filtro-tipo">Tipo de evento</label>
        <select id="filtro-tipo" name="tipo" defaultValue={tipoValido ?? ""} className={`${campo} w-auto basis-52`}>
          <option value="">Todos os eventos</option>
          {Object.entries(EVENTO)
            .sort((a, b) => a[1].rotulo.localeCompare(b[1].rotulo, "pt-BR"))
            .map(([codigo, e]) => <option key={codigo} value={codigo}>{e.rotulo}</option>)}
        </select>
        <button type="submit" className="flex min-h-11 shrink-0 items-center rounded-lg border border-[var(--color-borda)] px-4 text-sm hover:bg-[var(--color-cartao)]">Filtrar</button>
        {filtrado && (
          <Link href="/admin/eventos" className="flex min-h-11 shrink-0 items-center rounded-lg px-3 text-xs text-[var(--color-texto-fraco)] hover:text-[var(--color-texto)]">
            Limpar
          </Link>
        )}
      </form>
      {eventos.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-borda)] px-4 py-8 text-center text-sm text-[var(--color-texto-fraco)]">Nada registrado.</div>
      ) : (
        // Eram sete colunas e a tabela cortava em "App". Conta, app, detalhe e
        // autor contam a mesma história, então dividem a coluna do meio; o IP
        // só entra quando sobra largura.
        <div className="overflow-hidden rounded-xl border border-[var(--color-borda)]">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-[var(--color-cartao)] text-left text-xs uppercase tracking-wide text-[var(--color-texto-fraco)]">
              <tr>
                <th className="w-28 px-4 py-3 font-medium sm:w-40">Quando</th>
                <th className="px-4 py-3 font-medium">Evento</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Detalhe</th>
                <th className="hidden w-36 px-4 py-3 font-medium xl:table-cell">IP</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => {
                const ev = EVENTO[e.tipo] ?? { rotulo: e.tipo, tom: "neutro" as Tom };
                const porOutro = e.autor && e.autor !== e.email ? e.autor : null;
                return (
                  <tr key={e.id} className="border-t border-[var(--color-borda)] align-top">
                    <td className="px-4 py-2.5 text-xs text-[var(--color-texto-fraco)]">
                      <div className="whitespace-nowrap">{e.criadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })}</div>
                      <div className="whitespace-nowrap">{e.criadoEm.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2" title={e.tipo}>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${PONTO[ev.tom]}`} aria-hidden="true" />
                        <span className="truncate font-medium">{ev.rotulo}</span>
                      </div>
                      <div className="truncate pl-4 text-xs text-[var(--color-texto-fraco)]">
                        {e.email
                          ? <Link href={`/admin/eventos?email=${encodeURIComponent(e.email)}`} className="hover:text-[var(--color-marca)]">{e.email}</Link>
                          : "—"}
                      </div>
                    </td>
                    <td className="hidden px-4 py-2.5 text-xs text-[var(--color-texto-fraco)] md:table-cell">
                      {e.appId && <span className="mr-2 rounded bg-[var(--color-cartao)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-texto)]">{e.appId}</span>}
                      <span className="break-words">{e.detalhe ?? ""}</span>
                      {porOutro && <div className="truncate">por {porOutro}</div>}
                    </td>
                    <td className="hidden truncate px-4 py-2.5 font-mono text-xs text-[var(--color-texto-fraco)] xl:table-cell">{e.ip ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {temMais && (
        <div className="mt-4 flex justify-center">
          <Link href={`/admin/eventos?${proxima.toString()}`} className="flex min-h-11 items-center rounded-lg border border-[var(--color-borda)] px-4 text-sm hover:bg-[var(--color-cartao)]">
            Mais antigos
          </Link>
        </div>
      )}
    </div>
  );
}
