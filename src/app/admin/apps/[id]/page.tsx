import Link from "next/link";
import { notFound } from "next/navigation";
import { motivoDoAcesso, paraApp, recebeLogin, type Cadastro, type MotivoAcesso } from "@/lib/apps";
import { buscarCadastro } from "@/lib/cadastro";
import { descrever, divergencia, lerConferencias, precisaConferir } from "@/lib/conferencia";
import { listarContas, papelDaRole, type Conta } from "@/lib/contas";
import { ultimosLoginsNoApp } from "@/lib/eventos";
import { permissoesPorApp } from "@/lib/permissoes";
import { acaoPermissao } from "../../actions";
import { empresasDasAplicacoes, listarEmpresas } from "@/lib/empresas";
import { acaoRemoverAplicacao, acaoSalvarAplicacao, acaoVincularEmpresaDaAplicacao } from "../actions";
import VinculoEmpresa from "../../_componentes/VinculoEmpresa";
import CamposAplicacao from "../CamposAplicacao";
import FormAcao from "../../_componentes/FormAcao";
import { botao, botaoFraco, campo } from "../../_componentes/estilos";
import Papel from "../../_componentes/Papel";
import { VoltarLista } from "../../_componentes/lista/Interativos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aplicação" };

const MOTIVO: Record<MotivoAcesso, string> = {
  equipe: "equipe",
  aberto: "app aberto",
  liberado: "liberado",
};

function quando(d: Date | undefined): string {
  if (!d) return "nunca";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export default async function AplicacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await buscarCadastro(id);
  if (!c) notFound();

  const [porApp, empresas, vinculos, conferencias] = await Promise.all([permissoesPorApp(), listarEmpresas(), empresasDasAplicacoes(), lerConferencias()]);
  const conferencia = precisaConferir(c.situacao) ? (conferencias.get(c.id) ?? null) : null;
  const liberados = porApp[c.id] ?? [];
  const entra = recebeLogin(c);

  return (
    <div className="mx-auto max-w-5xl">
      <VoltarLista secao="apps" base="/admin/apps">← Aplicações</VoltarLista>
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{c.nome}</h1>
        <code className="rounded bg-[var(--color-cartao)] px-2 py-0.5 text-xs">{c.id}</code>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
          <FormAcao acao={acaoSalvarAplicacao}>
            <CamposAplicacao c={c} />
            <button type="submit" className={botao}>Salvar</button>
          </FormAcao>
        </section>

        <aside className="flex flex-col gap-4">
          <VinculoEmpresa
            acao={acaoVincularEmpresaDaAplicacao}
            id={c.id}
            atual={vinculos.get(c.id) ?? null}
            empresas={empresas}
            explicacao="Empresa responsável por esta aplicação. Serve para filtrar e agrupar o painel; não muda quem pode entrar."
          />
          <div className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-5 text-xs">
            <div className="mb-2 font-semibold">Conferência</div>
            {!precisaConferir(c.situacao) ? (
              <div className="text-[var(--color-texto-fraco)]">Aplicação planejada ou desativada não é conferida.</div>
            ) : !conferencia ? (
              <div className="text-[var(--color-texto-fraco)]">Ainda não conferida. A conferência roda quando a lista de aplicações é aberta.</div>
            ) : (
              <>
                <div className={divergencia(c.situacao, conferencia) ? "font-medium text-[var(--color-marca-amarelo)]" : ""}>
                  {descrever(conferencia)}{conferencia.responde && conferencia.status ? ` (código ${conferencia.status})` : ""}
                </div>
                <div className="mt-1 text-[var(--color-texto-fraco)]">
                  {`https://${c.host}/ em ${quando(conferencia.conferidaEm)}.`}
                  {divergencia(c.situacao, conferencia) ? " Discorda da situação informada no cadastro." : ""}
                </div>
              </>
            )}
          </div>
          <div className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-5 text-xs">
            <div className="mb-2 font-semibold">Login</div>
            {entra ? (
              <>
                <code className="block select-all break-all rounded bg-[var(--color-fundo)] p-2">
                  {`https://auth.avilaops.com/login?app=${c.id}&returnTo=https://${c.host}/`}
                </code>
                <div className="mt-2 text-[var(--color-texto-fraco)]">É para este endereço que a aplicação manda quem não tem sessão.</div>
              </>
            ) : (
              <div className="text-[var(--color-texto-fraco)]">
                {c.situacao === "desativado" && c.login ? "Desativado: o login não reconhece este cadastro." : "Não recebe sessão do login único."}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[var(--color-marca-vermelho)]/40 bg-[var(--color-cartao)] p-5 text-xs">
            <div className="mb-2 font-semibold text-[var(--color-marca-vermelho)]">Remover cadastro</div>
            <div className="mb-3 text-[var(--color-texto-fraco)]">
              Apaga a linha e as {liberados.length} liberações de cliente. Para tirar do login sem perder nada, use a situação &quot;desativado&quot;.
            </div>
            <FormAcao acao={acaoRemoverAplicacao} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={c.id} />
              <button type="submit" className={botaoFraco}>Remover {c.host}</button>
            </FormAcao>
          </div>
        </aside>
      </div>

      {entra ? (
        <Usuarios c={c} liberados={liberados} />
      ) : (
        <section className="mt-6 rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
          <h2 className="mb-1 text-sm font-semibold">Usuários</h2>
          <p className="text-xs text-[var(--color-texto-fraco)]">
            {c.tipo === "site"
              ? "Site não tem usuários: ninguém faz login nele."
              : "Este cadastro não usa o login único. Se a aplicação tem usuários, eles ficam no banco dela e não aparecem aqui."}
          </p>
        </section>
      )}
    </div>
  );
}

/**
 * Quem entra neste app, e por quê.
 *
 * A lista sai de `motivoDoAcesso`, a mesma função que o login consulta — não de
 * uma regra reescrita para a tela. Liberação é por e-mail, então pode existir
 * uma para um endereço que não tem conta; essas aparecem à parte, senão
 * ficariam valendo sem ninguém ver.
 */
async function Usuarios({ c, liberados }: { c: Cadastro; liberados: string[] }) {
  const [contas, logins] = await Promise.all([listarContas(), ultimosLoginsNoApp(c.id)]);
  const app = paraApp(c);
  const comLiberacao = new Set(liberados);

  const linhas: { conta: Conta; motivo: MotivoAcesso }[] = [];
  const semAcesso: Conta[] = [];
  for (const conta of contas) {
    const papel = papelDaRole(conta.role);
    const motivo = motivoDoAcesso(app, papel, comLiberacao.has(conta.email.toLowerCase()));
    if (motivo) linhas.push({ conta, motivo });
    else if (papel === "CLIENTE" && !app.papelExigido) semAcesso.push(conta);
  }
  const comConta = new Set(contas.map((x) => x.email.toLowerCase()));
  const orfas = liberados.filter((e) => !comConta.has(e));

  return (
    <section className="mt-6 rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
      <h2 className="mb-1 text-sm font-semibold">Usuários</h2>
      <p className="mb-4 text-xs text-[var(--color-texto-fraco)]">
        {app.papelExigido
          ? "Só a equipe entra."
          : app.restrito
            ? "Equipe e clientes liberados."
            : "App aberto: toda conta de cliente entra. Marque \"Cliente só entra se for liberado\" para fechar."}
        {" "}{linhas.length} {linhas.length === 1 ? "conta entra" : "contas entram"} hoje.
      </p>

      {app.restrito && !app.papelExigido && semAcesso.length > 0 && (
        <FormAcao acao={acaoPermissao} className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="appId" value={c.id} />
          <input type="hidden" name="acao" value="conceder" />
          <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Liberar cliente
            <select name="id" required defaultValue="" className={campo}>
              <option value="" disabled>Escolha a conta…</option>
              {semAcesso.map((x) => <option key={x.id} value={x.id}>{x.nome} · {x.email}</option>)}
            </select>
          </label>
          <button type="submit" className={botao}>Liberar</button>
        </FormAcao>
      )}

      {linhas.length === 0 ? (
        <p className="text-xs text-[var(--color-texto-fraco)]">Nenhuma conta entra neste app.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-[var(--color-texto-fraco)]">
              <tr>
                <th className="py-2 pr-4">Conta</th>
                <th className="py-2 pr-4">Papel</th>
                <th className="py-2 pr-4">Entra como</th>
                <th className="py-2 pr-4">Último acesso aqui</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ conta, motivo }) => (
                <tr key={conta.id} className="border-t border-[var(--color-borda)]">
                  <td className="py-2 pr-4">
                    <Link href={`/admin/contas/${conta.id}`} className="font-medium hover:text-[var(--color-marca)]">{conta.nome}</Link>
                    <div className="break-all text-xs text-[var(--color-texto-fraco)]">{conta.email}</div>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4"><Papel role={conta.role} /></td>
                  <td className="whitespace-nowrap py-2 pr-4 text-xs">{MOTIVO[motivo]}</td>
                  <td className="whitespace-nowrap py-2 pr-4 text-xs text-[var(--color-texto-fraco)]">{quando(logins.get(conta.email.toLowerCase()))}</td>
                  <td className="py-2 text-right">
                    {motivo === "liberado" && (
                      <FormAcao acao={acaoPermissao} className="contents">
                        <input type="hidden" name="id" value={conta.id} />
                        <input type="hidden" name="appId" value={c.id} />
                        <input type="hidden" name="acao" value="revogar" />
                        <button type="submit" className={botaoFraco}>Revogar</button>
                      </FormAcao>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {orfas.length > 0 && (
        <p className="mt-4 text-xs text-[var(--color-texto-fraco)]">
          Liberações para e-mail sem conta ativa: <span className="break-all">{orfas.join(", ")}</span>. Passam a valer se a conta for criada ou religada.
        </p>
      )}
    </section>
  );
}
