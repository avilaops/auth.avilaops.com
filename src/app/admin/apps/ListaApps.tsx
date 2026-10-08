"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

export type AppResumo = {
  id: string;
  nome: string;
  host: string;
  acesso: string;
  tipo: "app" | "site";
  situacao: string;
  /** Recebe sessão do login único (site e desativado não recebem). */
  login: boolean;
  deepLink?: string;
  liberados: string[];
};

type Modo = "cards" | "lista";
const CHAVE = "auth-admin-apps-modo";

/**
 * A preferência mora no `localStorage`, que não existe no servidor.
 *
 * Isto era um `useEffect` que lia o storage e chamava `setModo`: renderizava
 * no padrão, corrigia logo depois e piscava. `useSyncExternalStore` lê a
 * preferência como o que ela é — uma fonte externa a React —, entrega o padrão
 * na renderização do servidor (sem divergência de hidratação) e ainda mantém
 * duas abas do painel em sincronia de graça.
 */
const ouvintes = new Set<() => void>();

function assinar(aoMudar: () => void): () => void {
  ouvintes.add(aoMudar);
  window.addEventListener("storage", aoMudar);
  return () => {
    ouvintes.delete(aoMudar);
    window.removeEventListener("storage", aoMudar);
  };
}

function lerModo(): Modo {
  try {
    const salvo = localStorage.getItem(CHAVE);
    return salvo === "lista" || salvo === "cards" ? salvo : "cards";
  } catch {
    return "cards"; // navegador sem storage: fica no padrão
  }
}

/** No servidor não há preferência; o padrão é o que vai no HTML. */
function modoDoServidor(): Modo {
  return "cards";
}

/**
 * Registro de apps em dois modos: cards (visão geral) e lista (varredura
 * rápida, muitos apps). A escolha fica no navegador — é preferência de quem
 * usa o painel, não estado do sistema.
 */
export default function ListaApps({ apps }: { apps: AppResumo[] }) {
  const modo = useSyncExternalStore(assinar, lerModo, modoDoServidor);

  function trocar(m: Modo) {
    try {
      localStorage.setItem(CHAVE, m);
    } catch {
      /* sem storage: a troca vale só nesta visita */
    }
    for (const aoMudar of ouvintes) aoMudar();
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-end">
        <div role="group" aria-label="Modo de exibição" className="inline-flex rounded-lg border border-[var(--color-borda)] p-0.5 text-xs">
          <Botao ativo={modo === "cards"} onClick={() => trocar("cards")} titulo="Cards">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" />
              <rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" />
            </svg>
          </Botao>
          <Botao ativo={modo === "lista"} onClick={() => trocar("lista")} titulo="Lista">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <rect x="1" y="2" width="14" height="2" rx="1" /><rect x="1" y="7" width="14" height="2" rx="1" /><rect x="1" y="12" width="14" height="2" rx="1" />
            </svg>
          </Botao>
        </div>
      </div>

      {modo === "cards" ? <Cards apps={apps} /> : <Lista apps={apps} />}
    </>
  );
}

function Botao({ ativo, onClick, titulo, children }: { ativo: boolean; onClick: () => void; titulo: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-pressed={ativo}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 ${ativo ? "bg-[var(--color-cartao)] text-[var(--color-texto)]" : "text-[var(--color-texto-fraco)] hover:text-[var(--color-texto)]"}`}
    >
      {children}
      <span>{titulo}</span>
    </button>
  );
}

const SITUACAO: Record<string, { texto: string; classe: string }> = {
  no_ar: { texto: "no ar", classe: "bg-emerald-500/10 text-emerald-400" },
  fora_do_ar: { texto: "fora do ar", classe: "bg-red-500/10 text-red-400" },
  planejado: { texto: "planejado", classe: "bg-sky-500/10 text-sky-400" },
  desativado: { texto: "desativado", classe: "bg-[var(--color-fundo)] text-[var(--color-texto-fraco)]" },
};

function Situacao({ valor }: { valor: string }) {
  const s = SITUACAO[valor] ?? SITUACAO.fora_do_ar;
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${s.classe}`}>{s.texto}</span>;
}

function urlLogin(app: AppResumo) {
  return `https://auth.avilaops.com/login?app=${app.id}&returnTo=https://${app.host}/`;
}

function Cards({ apps }: { apps: AppResumo[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {apps.map((app) => (
        <div key={app.id} className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/admin/apps/${app.id}`} className="block truncate font-medium hover:text-[var(--color-marca)]">{app.nome}</Link>
              <a href={`https://${app.host}`} className="block truncate text-xs text-[var(--color-texto-fraco)] hover:text-[var(--color-marca)]">{app.host}</a>
            </div>
            <Situacao valor={app.situacao} />
          </div>
          <div className="mt-3 text-xs">
            <span className="text-[var(--color-texto-fraco)]">{app.tipo === "site" ? "Site" : "Aplicação"} · </span>{app.acesso}
            {app.deepLink && <span className="text-[var(--color-texto-fraco)]"> · nativo ({app.deepLink})</span>}
          </div>
          {app.liberados.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1">
              {app.liberados.map((e) => (
                <li key={e} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">{e}</li>
              ))}
            </ul>
          )}
          {app.login && (
            <div className="mt-3 break-all text-[11px] text-[var(--color-texto-fraco)]">
              Login: <code>{urlLogin(app)}</code>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Lista({ apps }: { apps: AppResumo[] }) {
  return (
    // Eram seis colunas sem quebra e a tabela cortava em "Situação". O host
    // desce para baixo do nome e os liberados viram contagem; nada rola de lado.
    <div className="overflow-hidden rounded-xl border border-[var(--color-borda)]">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-[var(--color-cartao)] text-left text-xs uppercase tracking-wide text-[var(--color-texto-fraco)]">
          <tr>
            <th className="px-4 py-3 font-medium">Aplicação</th>
            <th className="w-28 px-4 py-3 font-medium">Situação</th>
            <th className="hidden w-52 px-4 py-3 font-medium sm:table-cell">Acesso</th>
            <th className="hidden w-28 px-4 py-3 font-medium xl:table-cell">Liberados</th>
            <th className="w-20 px-4 py-3 font-medium">Login</th>
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => (
            <tr key={app.id} className="border-t border-[var(--color-borda)] hover:bg-[var(--color-cartao)]">
              <td className="px-4 py-3">
                <Link href={`/admin/apps/${app.id}`} className="block truncate font-medium hover:text-[var(--color-marca)]">{app.nome}</Link>
                <a href={`https://${app.host}`} className="block truncate text-xs text-[var(--color-texto-fraco)] hover:text-[var(--color-marca)]">{app.host}</a>
              </td>
              <td className="px-4 py-3"><Situacao valor={app.situacao} /></td>
              <td className="hidden px-4 py-3 text-xs sm:table-cell">
                {app.acesso}
                {app.deepLink && <span className="text-[var(--color-texto-fraco)]"> · nativo</span>}
              </td>
              <td className="hidden px-4 py-3 text-xs xl:table-cell" title={app.liberados.join(", ")}>
                {app.liberados.length === 0
                  ? <span className="text-[var(--color-texto-fraco)]">—</span>
                  : `${app.liberados.length} conta${app.liberados.length === 1 ? "" : "s"}`}
              </td>
              <td className="px-4 py-3">
                {app.login
                  ? <a href={urlLogin(app)} className="text-xs text-[var(--color-marca)] hover:underline">abrir</a>
                  : <span className="text-xs text-[var(--color-texto-fraco)]">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
