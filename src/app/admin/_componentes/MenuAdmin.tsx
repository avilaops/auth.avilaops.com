"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; rotulo: string; icone: React.ReactNode };

const traco = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Icone({ children }: { children: React.ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0" {...traco}>
      {children}
    </svg>
  );
}

const MENU: Item[] = [
  {
    href: "/admin",
    rotulo: "Contas",
    icone: <Icone><circle cx="7.5" cy="7" r="3" /><path d="M2 16.5c.6-3 2.7-4.5 5.5-4.5s4.9 1.500 5.500 4.500" /><path d="M13.500 4.300a3 3 0 0 1 0 5.400M15.500 12.300c1.400.6 2.200 2 2.500 4.200" /></Icone>,
  },
  {
    href: "/admin/apps",
    rotulo: "Aplicações",
    icone: <Icone><rect x="3" y="3" width="6" height="6" rx="1.500" /><rect x="11" y="3" width="6" height="6" rx="1.500" /><rect x="3" y="11" width="6" height="6" rx="1.500" /><rect x="11" y="11" width="6" height="6" rx="1.500" /></Icone>,
  },
  {
    href: "/admin/conectores",
    rotulo: "Conectores",
    icone: <Icone><path d="M8.500 11.500 11.500 8.500" /><path d="M9.500 6 11 4.500a3.200 3.200 0 0 1 4.500 4.500L14 10.500" /><path d="M10.500 14 9 15.500A3.200 3.200 0 0 1 4.500 11L6 9.500" /></Icone>,
  },
  {
    href: "/admin/integracoes",
    rotulo: "Integrações",
    icone: <Icone><path d="M7 3v4M13 3v4M5 7h10v3a5 5 0 0 1-10 0V7ZM10 15v2.5" /></Icone>,
  },
  {
    href: "/admin/eventos",
    rotulo: "Atividade",
    icone: <Icone><path d="M2.500 10h3l2-5 3.500 10 2-5h4.500" /></Icone>,
  },
];

function ativo(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/contas");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Menu do painel. Vertical na barra lateral (tela larga); horizontal e rolável
 * no topo (tela estreita). O item atual leva a cor da marca nos dois — é a
 * pista de onde a pessoa está, e antes era só um cinza um pouco mais escuro.
 */
export default function MenuAdmin({ orientacao }: { orientacao: "vertical" | "horizontal" }) {
  const pathname = usePathname();

  if (orientacao === "horizontal") {
    return (
      <nav aria-label="Seções do painel" className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MENU.map((m) => {
          const atual = ativo(pathname, m.href);
          return (
            <Link
              key={m.href}
              href={m.href}
              aria-current={atual ? "page" : undefined}
              className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm ${
                atual
                  ? "bg-[var(--color-marca-solida)] font-semibold text-[var(--color-marca-contraste)]"
                  : "text-[var(--color-texto-fraco)] hover:bg-[var(--color-fundo)] hover:text-[var(--color-texto)]"
              }`}
            >
              {m.icone}
              {m.rotulo}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Seções do painel" className="flex flex-col gap-1">
      {MENU.map((m) => {
        const atual = ativo(pathname, m.href);
        return (
          <Link
            key={m.href}
            href={m.href}
            aria-current={atual ? "page" : undefined}
            className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm ${
              atual
                ? "bg-[var(--color-marca-suave)] font-semibold text-[var(--color-marca)]"
                : "text-[var(--color-texto-fraco)] hover:bg-[var(--color-fundo)] hover:text-[var(--color-texto)]"
            }`}
          >
            {m.icone}
            {m.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
