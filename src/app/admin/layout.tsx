import Link from "next/link";
import { exigirAdmin } from "@/lib/admin";
import Marca from "@/components/Marca";
import MenuAdmin from "./_componentes/MenuAdmin";

export const dynamic = "force-dynamic";

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "?";
}

/**
 * Casca do painel.
 *
 * Tela larga (a partir de 1024px): barra lateral presa à janela, com a conta
 * de quem está logado sempre visível no pé. Abaixo disso a lateral some e vira
 * uma barra no topo com o menu em faixa — antes a lateral aparecia já em
 * 768px e tomava um terço da largura, que era o que fazia as tabelas cortarem.
 * O `MenuAdmin` é o mesmo nos dois lugares; só muda a orientação.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sessao = await exigirAdmin();

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <header className="sticky top-0 z-20 border-b border-[var(--color-borda)] bg-[var(--color-cartao)] pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Link href="/admin" className="flex items-center gap-2">
            <Marca tamanho={32} className="shrink-0" />
            <span className="text-sm font-semibold">Avila Ops</span>
          </Link>
          <div className="flex items-center gap-1 text-xs">
            <Link href="/conta" className="flex min-h-11 items-center px-3 text-[var(--color-texto-fraco)] hover:text-[var(--color-texto)]">
              Minha conta
            </Link>
            <form action="/api/auth/logout" method="post">
              <button className="flex min-h-11 items-center px-3 text-[var(--color-texto-fraco)] hover:text-[var(--color-texto)]">Sair</button>
            </form>
          </div>
        </div>
        <MenuAdmin orientacao="horizontal" />
      </header>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-[var(--color-borda)] bg-[var(--color-cartao)] p-4 lg:flex">
        <Link href="/admin" className="mb-6 flex items-center gap-2.5 px-2">
          <Marca tamanho={32} className="shrink-0" />
          <div>
            <div className="text-sm font-semibold">Avila Ops</div>
            <div className="text-[11px] text-[var(--color-texto-fraco)]">Identidade</div>
          </div>
        </Link>

        <div className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-[var(--color-texto-apagado)]">Painel</div>
        <MenuAdmin orientacao="vertical" />

        <div className="mt-auto border-t border-[var(--color-borda)] pt-4">
          <div className="flex items-center gap-3 px-1">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-marca-suave)] text-xs font-semibold text-[var(--color-marca)]">
              {iniciais(sessao.nome)}
            </span>
            <div className="min-w-0 text-xs">
              <div className="truncate font-medium">{sessao.nome}</div>
              <div className="truncate text-[var(--color-texto-fraco)]">{sessao.email}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <Link href="/conta" className="flex min-h-9 items-center justify-center rounded-lg border border-[var(--color-borda)] hover:bg-[var(--color-fundo)]">
              Minha conta
            </Link>
            <form action="/api/auth/logout" method="post" className="contents">
              <button className="flex min-h-9 items-center justify-center rounded-lg border border-[var(--color-borda)] hover:bg-[var(--color-fundo)]">Sair</button>
            </form>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
