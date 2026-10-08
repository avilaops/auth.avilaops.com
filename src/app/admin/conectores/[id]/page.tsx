import Link from "next/link";
import { notFound } from "next/navigation";
import IconeProvedor from "@/components/IconeProvedor";
import { listarConectores } from "@/lib/conectores";
import { urlAbsoluta } from "@/lib/urls";
import { acaoLigarConector, acaoSalvarConector } from "../actions";
import FormAcao from "../../_componentes/FormAcao";
import { botao, botaoFraco, campo } from "../../_componentes/estilos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conector" };

export default async function ConectorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = (await listarConectores()).find((x) => x.provedor.id === id);
  if (!c) notFound();
  const p = c.provedor;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/conectores" className="text-xs text-[var(--color-texto-fraco)] hover:text-[var(--color-texto)]">← Conectores</Link>
      <div className="mt-2 mb-6 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--color-borda)] bg-[var(--color-fundo)]">
          <IconeProvedor id={p.id} tamanho={p.id === "govbr" ? 16 : 26} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{p.nome}</h1>
          <p className="text-sm text-[var(--color-texto-fraco)]">{p.descricao}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
          <h2 className="mb-4 text-sm font-semibold">Credenciais</h2>
          <FormAcao acao={acaoSalvarConector}>
            <input type="hidden" name="id" value={p.id} />
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Client ID{p.id === "apple" && " (Services ID)"}
              <input name="clientId" defaultValue={c.clientId ?? ""} required className={campo} autoComplete="off" /></label>
            {p.id !== "apple" && (
              <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">
                Client Secret {c.secretFinal && <span>(salvo: ••••{c.secretFinal} — deixe vazio para manter)</span>}
                <input name="clientSecret" type="password" className={campo} autoComplete="new-password" placeholder={c.secretFinal ? "manter o atual" : ""} />
              </label>
            )}
            {(p.extras ?? []).map((x) => (
              <label key={x.chave} className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">
                {x.rotulo}{x.obrigatorio && " *"}
                {x.multilinha ? (
                  <textarea name={`extra_${x.chave}`} rows={6} className={`${campo} font-mono text-xs`} placeholder={c.extras[x.chave] ? "salvo — deixe vazio para manter" : ""} />
                ) : (
                  <input name={`extra_${x.chave}`} defaultValue={c.extras[x.chave] ?? x.padrao ?? ""} className={campo} autoComplete="off" />
                )}
                {x.dica && <span className="text-[11px]">{x.dica}</span>}
              </label>
            ))}
            <button type="submit" className={botao}>Salvar</button>
          </FormAcao>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-5 text-xs">
            <div className="mb-2 font-semibold">Estado</div>
            <div className="text-[var(--color-texto-fraco)]">
              {c.ligado ? "Ligado — aparece na tela de login." : c.configurado ? "Configurado, desligado." : "Faltam credenciais."}
            </div>
            {c.configurado && (
              <FormAcao acao={acaoLigarConector} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="ligado" value={c.ligado ? "0" : "1"} />
                <button type="submit" className={c.ligado ? botaoFraco : botao}>{c.ligado ? "Desligar" : "Ligar"}</button>
              </FormAcao>
            )}
            {c.ligado && (
              <a href={`/api/auth/${p.id}?returnTo=/conta`} target="_blank" rel="noreferrer" className={`${botaoFraco} mt-2 block text-center`}>
                Testar login
              </a>
            )}
            {c.atualizadoEm && (
              <div className="mt-3 text-[11px] text-[var(--color-texto-fraco)]">
                Atualizado {c.atualizadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} por {c.atualizadoPor}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-5 text-xs">
            <div className="mb-2 font-semibold">Redirect URI</div>
            <code className="block select-all break-all rounded bg-[var(--color-fundo)] p-2">{c.redirectUri}</code>
            <div className="mt-2 text-[var(--color-texto-fraco)]">Cole exatamente assim no console do provedor.</div>
          </div>

          {p.id === "facebook" && (
            <div className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-5 text-xs">
              <div className="mb-2 font-semibold">Conexão de ativos</div>
              <div className="text-[var(--color-texto-fraco)]">Além do login, o mesmo app atende a tela /conta/meta. Cadastrar também no painel da Meta:</div>
              {[
                ["Redirect URI da conexão", "/api/meta/callback"],
                ["Exclusão de dados (callback)", "/api/meta/exclusao"],
                ["Desautorização (callback)", "/api/meta/desautorizar"],
              ].map(([rotulo, caminho]) => (
                <div key={caminho} className="mt-3">
                  <div className="mb-1 text-[var(--color-texto-fraco)]">{rotulo}</div>
                  <code className="block select-all break-all rounded bg-[var(--color-fundo)] p-2">{urlAbsoluta(caminho)}</code>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-5 text-xs">
            <div className="mb-2 font-semibold">Como obter</div>
            <p className="text-[var(--color-texto-fraco)]">{p.instrucoes}</p>
            <a href={p.docs} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[var(--color-marca)] hover:underline">Abrir console do {p.nome} ↗</a>
            <div className="mt-2 text-[var(--color-texto-fraco)]">Escopos: <code>{p.escopos.join(" ")}</code></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
