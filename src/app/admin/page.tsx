import Link from "next/link";
import { listarContas } from "@/lib/contas";
import { ultimosLogins } from "@/lib/eventos";
import { ativosPorEmail, diagnosticar } from "@/lib/segundoFator";
import { botao, campo } from "./_componentes/estilos";
import Papel from "./_componentes/Papel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contas" };

function quando(d: Date | undefined): string {
  if (!d) return "nunca";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export default async function ContasPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [contas, logins, comFator, saude] = await Promise.all([
    listarContas(q),
    ultimosLogins(),
    ativosPorEmail(),
    diagnosticar(),
  ]);
  const equipe = contas.filter((c) => c.role === "ADMIN").length;

  return (
    <div className="mx-auto max-w-6xl">
      {/*
        A suspensão do segundo fator é silenciosa por desenho — o login segue
        funcionando, que é o certo. O que não pode é ninguém ficar sabendo:
        aqui é a primeira tela que a equipe abre, e é onde a falta aparece.
      */}
      {!saude.disponivel && (
        <div role="alert" className="mb-5 rounded-xl border border-red-900/50 bg-red-950/30 p-4 text-sm">
          <strong className="text-red-300">Verificação em duas etapas suspensa.</strong>{" "}
          <span className="text-[var(--color-texto-fraco)]">
            {saude.migracoes === "pendentes"
              ? "As tabelas do segundo fator não existem neste banco — rode `npx prisma migrate deploy`."
              : "Falta AUTH_ENCRYPTION_KEY no servidor."}{" "}
            Enquanto isso, todas as contas entram só com a senha.
          </span>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Contas</h1>
          <p className="mt-1 text-sm text-[var(--color-texto-fraco)]">
            {contas.length} conta{contas.length === 1 ? "" : "s"} · {equipe} da equipe · {contas.length - equipe} cliente{contas.length - equipe === 1 ? "" : "s"}
          </p>
        </div>
        <Link href="/admin/contas/nova" className={`${botao} shrink-0 whitespace-nowrap`}>+ Nova conta</Link>
      </div>

      <form className="mb-4">
        <label className="sr-only" htmlFor="busca">Buscar</label>
        <input id="busca" name="q" type="search" defaultValue={q ?? ""} placeholder="Buscar por nome, e-mail ou CPF" className={campo} />
      </form>

      {contas.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-borda)] px-4 py-8 text-center text-sm text-[var(--color-texto-fraco)]">
          Nenhuma conta encontrada.
        </div>
      ) : (
        <>
          {/* Celular: um cartão por conta, tudo legível sem rolagem lateral. */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {contas.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/contas/${c.id}`}
                  className="block rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-4 active:bg-[var(--color-fundo)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{c.nome}</div>
                      <div className="truncate text-xs text-[var(--color-texto-fraco)]">{c.email}</div>
                    </div>
                    <Papel role={c.role} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-texto-fraco)]">
                    {c.senhaProvisoria
                      ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-400">senha provisória</span>
                      : <span>senha definida</span>}
                    {comFator.has(c.email.toLowerCase()) && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400">2FA</span>
                    )}
                    <span>último login {quando(logins.get(c.email.toLowerCase()))}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/*
            Tela larga: tabela. Eram sete colunas e as duas últimas saíam da
            tela; nome e e-mail dividem uma célula, senha e 2FA outra, e a data
            de criação só entra quando sobra largura.
          */}
          <div className="hidden overflow-hidden rounded-xl border border-[var(--color-borda)] lg:block">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-[var(--color-cartao)] text-left text-xs uppercase tracking-wide text-[var(--color-texto-fraco)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Conta</th>
                  <th className="w-44 px-4 py-3 font-medium">Papel</th>
                  <th className="w-40 px-4 py-3 font-medium">Acesso</th>
                  <th className="w-36 px-4 py-3 font-medium">Último login</th>
                  <th className="hidden w-36 px-4 py-3 font-medium xl:table-cell">Criada</th>
                </tr>
              </thead>
              <tbody>
                {contas.map((c) => (
                  <tr key={c.id} className="border-t border-[var(--color-borda)] hover:bg-[var(--color-cartao)]">
                    <td className="px-4 py-3">
                      <Link href={`/admin/contas/${c.id}`} className="block truncate font-medium hover:text-[var(--color-marca)]">{c.nome}</Link>
                      <div className="truncate text-xs text-[var(--color-texto-fraco)]">{c.email}</div>
                    </td>
                    <td className="px-4 py-3"><Papel role={c.role} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {c.senhaProvisoria
                          ? <span className="whitespace-nowrap rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-400">senha provisória</span>
                          : <span className="whitespace-nowrap text-[var(--color-texto-fraco)]">senha definida</span>}
                        {comFator.has(c.email.toLowerCase()) && (
                          <span className="whitespace-nowrap rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400">2FA</span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--color-texto-fraco)]">{quando(logins.get(c.email.toLowerCase()))}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-[var(--color-texto-fraco)] xl:table-cell">{quando(c.criadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
