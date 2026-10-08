import Link from "next/link";
import { listarCadastro } from "@/lib/cadastro";
import { listarIntegracoes } from "@/lib/clientesOidc";
import { baseUrl } from "@/lib/urls";
import FormAcao from "../_componentes/FormAcao";
import { botao, campo } from "../_componentes/estilos";
import { acaoCriarIntegracao } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrações" };

/**
 * Sistemas que se conectam ao auth com credencial própria: login por OIDC
 * (TMS, Notas, software de terceiro) e leitura das conexões da Meta.
 */
export default async function IntegracoesPage() {
  const [integracoes, apps] = await Promise.all([listarIntegracoes(), listarCadastro()]);
  const nomeApp = new Map(apps.map((a) => [a.id, a.nome]));
  const base = baseUrl();

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
      <p className="mt-1 mb-5 text-sm text-[var(--color-texto-fraco)]">
        {integracoes.length} cadastrada{integracoes.length === 1 ? "" : "s"}. Cada sistema entra com o próprio identificador e segredo — para login por OIDC e, quando liberado, para ler as conexões da Meta.
      </p>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          {integracoes.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-borda)] px-4 py-8 text-center text-sm text-[var(--color-texto-fraco)]">Nenhuma integração ainda.</div>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-[var(--color-borda)]">
              {integracoes.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-borda)] bg-[var(--color-cartao)] px-4 py-3 first:border-t-0">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {i.origem === "painel"
                        ? <Link href={`/admin/integracoes/${i.id}`} className="font-medium hover:text-[var(--color-marca)]">{i.nome}</Link>
                        : <span className="font-medium">{i.nome}</span>}
                      <code className="rounded bg-[var(--color-fundo)] px-1.5 py-0.5 text-[11px]">{i.id}</code>
                      {!i.ativo && <span className="whitespace-nowrap rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-400">desativada</span>}
                      {i.acessoMeta && <span className="whitespace-nowrap rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-400">lê a Meta</span>}
                      {i.origem === "codigo" && <span className="whitespace-nowrap rounded-full bg-[var(--color-fundo)] px-2 py-0.5 text-[11px] text-[var(--color-texto-fraco)]">fixa no código</span>}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[var(--color-texto-fraco)]">
                      {nomeApp.get(i.appId) ?? i.appId}
                      {i.redirectUris.length > 0 ? ` · ${i.redirectUris[0]}${i.redirectUris.length > 1 ? ` (+${i.redirectUris.length - 1})` : ""}` : " · só API"}
                    </div>
                  </div>
                  {i.origem === "painel" && (
                    <Link href={`/admin/integracoes/${i.id}`} className="shrink-0 text-xs text-[var(--color-marca)] hover:underline">Editar</Link>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-5 text-xs text-[var(--color-texto-fraco)]">
            <div className="mb-2 text-sm font-semibold text-[var(--color-texto)]">O que passar para o sistema</div>
            <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[150px_1fr]">
              <dt>Descoberta OIDC</dt><dd><code className="select-all break-all">{base}/.well-known/openid-configuration</code></dd>
              <dt>Autorização</dt><dd><code className="select-all break-all">{base}/oauth/authorize</code></dd>
              <dt>Token</dt><dd><code className="select-all break-all">{base}/oauth/token</code></dd>
              <dt>Dados do usuário</dt><dd><code className="select-all break-all">{base}/oauth/userinfo</code></dd>
              <dt>Conexões da Meta</dt><dd><code className="select-all break-all">{base}/api/meta/ativos?email=…</code> (Basic com identificador e segredo)</dd>
            </dl>
          </div>
        </div>

        <section className="h-fit rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-5">
          <h2 className="mb-4 text-sm font-semibold">Nova integração</h2>
          <FormAcao acao={acaoCriarIntegracao}>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Identificador (client_id)
              <input name="id" required placeholder="crm" className={`${campo} font-mono`} autoComplete="off" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Nome
              <input name="nome" required placeholder="CRM" className={campo} autoComplete="off" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Aplicação
              <select name="appId" required defaultValue="" className={campo}>
                <option value="" disabled>Escolha…</option>
                {apps.map((a) => <option key={a.id} value={a.id}>{a.nome} ({a.id})</option>)}
              </select>
              <span className="text-[11px]">É o cadastro dela que decide quem pode entrar.</span>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Endereços de retorno (um por linha)
              <textarea name="redirectUris" rows={3} placeholder="https://crm.avilaops.com/api/auth/callback" className={`${campo} font-mono text-xs`} />
            </label>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" name="acessoMeta" className="mt-0.5" />
              <span>Pode ler as conexões da Meta dos clientes<span className="block text-[11px] text-[var(--color-texto-fraco)]">Entrega o token de Páginas, WhatsApp e anúncios. Só para sistema da casa.</span></span>
            </label>
            <button type="submit" className={botao}>Criar e gerar segredo</button>
          </FormAcao>
        </section>
      </div>
    </div>
  );
}
