import Link from "next/link";
import IconeProvedor from "@/components/IconeProvedor";
import { listarConectores, vinculosPorProvedor } from "@/lib/conectores";
import { chaveConfigurada } from "@/lib/cripto";
import { acaoLigarConector } from "./actions";
import FormAcao from "../_componentes/FormAcao";
import { botao, botaoFraco } from "../_componentes/estilos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conectores" };

export default async function ConectoresPage() {
  const [conectores, contagem] = await Promise.all([listarConectores(), vinculosPorProvedor()]);
  const ligados = conectores.filter((c) => c.ligado).length;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">Conectores</h1>
      <p className="mt-1 mb-5 text-sm text-[var(--color-texto-fraco)]">
        {ligados} de {conectores.length} ligado{ligados === 1 ? "" : "s"}. É por onde as pessoas entram além da senha; ligar um conector faz o botão aparecer na tela de login na hora.
      </p>

      {!chaveConfigurada() && (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
          <strong>AUTH_ENCRYPTION_KEY</strong> não está configurada no servidor. Dá para ver esta tela, mas não para salvar credenciais.
          Gere com <code>openssl rand -hex 32</code> e coloque no <code>.env</code> do container.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-[var(--color-borda)]">
        <ul className="divide-y divide-[var(--color-borda)]">
          {conectores.map((c) => (
            <li key={c.provedor.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 bg-[var(--color-cartao)] px-4 py-4 sm:flex-nowrap sm:px-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--color-borda)] bg-[var(--color-fundo)]">
                <IconeProvedor id={c.provedor.id} tamanho={c.provedor.id === "govbr" ? 14 : 22} />
              </span>
              <div className="min-w-0 flex-1 basis-40">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/admin/conectores/${c.provedor.id}`} className="font-medium hover:text-[var(--color-marca)]">{c.provedor.nome}</Link>
                  <Estado ligado={c.ligado} configurado={c.configurado} />
                </div>
                <div className="truncate text-xs text-[var(--color-texto-fraco)]">{c.provedor.descricao}</div>
                <div className="mt-1 text-[11px] text-[var(--color-texto-fraco)]">
                  {c.clientId ? <>Client ID <code>{c.clientId.slice(0, 12)}…</code></> : "sem credenciais"}
                  {" · "}{contagem[c.provedor.id] ?? 0} conta{(contagem[c.provedor.id] ?? 0) === 1 ? "" : "s"} vinculada{(contagem[c.provedor.id] ?? 0) === 1 ? "" : "s"}
                </div>
              </div>
              <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
                <Link href={`/admin/conectores/${c.provedor.id}`} className={botaoFraco}>
                  {c.configurado ? "Editar" : "Configurar"}
                </Link>
                {c.configurado && (
                  <FormAcao acao={acaoLigarConector} className="contents">
                    <input type="hidden" name="id" value={c.provedor.id} />
                    <input type="hidden" name="ligado" value={c.ligado ? "0" : "1"} />
                    <button type="submit" className={c.ligado ? botaoFraco : botao}>
                      {c.ligado ? "Desligar" : "Ligar"}
                    </button>
                  </FormAcao>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-4 text-xs text-[var(--color-texto-fraco)]">
        Regras: login social nunca concede papel de equipe. Conta da equipe só ganha um conector quando a própria pessoa,
        logada com senha, vincula em <code>/conta</code>. Cliente novo entra como cliente; e-mail sem verificação do provedor não funde com conta existente.
      </p>
    </div>
  );
}

function Estado({ ligado, configurado }: { ligado: boolean; configurado: boolean }) {
  if (ligado) return <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-400">ligado</span>;
  if (configurado) return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-400">configurado · desligado</span>;
  return <span className="rounded-full bg-[var(--color-fundo)] px-2 py-0.5 text-[11px] text-[var(--color-texto-fraco)]">não configurado</span>;
}
