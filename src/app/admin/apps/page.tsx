import Link from "next/link";
import { recebeLogin } from "@/lib/apps";
import { listarCadastro } from "@/lib/cadastro";
import { permissoesPorApp } from "@/lib/permissoes";
import { botao } from "../_componentes/estilos";
import ListaApps, { type AppResumo } from "./ListaApps";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aplicações" };

export default async function AppsPage() {
  const [cadastro, porApp] = await Promise.all([listarCadastro(), permissoesPorApp()]);

  const apps: AppResumo[] = cadastro.map((c) => {
    const login = recebeLogin(c);
    return {
      id: c.id,
      nome: c.nome,
      host: c.host,
      tipo: c.tipo,
      situacao: c.situacao,
      login,
      deepLink: c.deepLink ?? undefined,
      liberados: porApp[c.id] ?? [],
      acesso: !login
        ? "Sem login único"
        : c.papelExigido === "ADMIN"
          ? "Só equipe"
          : c.restrito
            ? "Equipe + clientes liberados"
            : "Equipe + qualquer cliente",
    };
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Aplicações</h1>
          <p className="mt-1 text-sm text-[var(--color-texto-fraco)]">
            {apps.length} cadastrada{apps.length === 1 ? "" : "s"} · {apps.filter((a) => a.situacao === "no_ar").length} no ar. Só recebe sessão o que está marcado com login único.
          </p>
        </div>
        <Link href="/admin/apps/novo" className={`${botao} shrink-0 whitespace-nowrap`}>+ Nova aplicação</Link>
      </div>
      <ListaApps apps={apps} />
    </div>
  );
}
