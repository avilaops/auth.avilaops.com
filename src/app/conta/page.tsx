import Link from "next/link";
import { redirect } from "next/navigation";
import IconeProvedor from "@/components/IconeProvedor";
import { ehSuperadmin } from "@/lib/admin";
import { listarCadastro } from "@/lib/cadastro";
import { caixasDoDono } from "@/lib/caixaEmail";
import { conectoresLigados } from "@/lib/conectores";
import { buscarConta } from "@/lib/contas";
import { listarPermissoes } from "@/lib/permissoes";
import { menuDeApps } from "@/lib/menuDeApps";
import { estado as estadoSegundoFator, exigeSegundoFator, mfaDisponivel, mfaHabilitado } from "@/lib/segundoFator";
import { buscarProvedor, nomeProvedor } from "@/lib/provedores";
import { enderecoDaSecao, secaoDaConta, SECOES_DA_CONTA } from "@/lib/secoesDaConta";
import { lerSessao } from "@/lib/sessao";
import { listarVinculos } from "@/lib/vinculos";
import BotoesSociais from "@/app/login/BotoesSociais";
import { acaoDesvincular, acaoMeusDados } from "./actions";
import SegundoFator from "./SegundoFator";
import SistemasDaConta from "./SistemasDaConta";

export const dynamic = "force-dynamic";
export const metadata = { title: "Minha conta" };

const WEBMAIL = "https://mail.avilaops.com";

function gb(bytes: number): string {
  const g = bytes / 1024 ** 3;
  if (g >= 1) return `${g.toFixed(g >= 10 ? 0 : 1)} GB`;
  const m = bytes / 1024 ** 2;
  return `${m < 1 ? "0" : m.toFixed(0)} MB`;
}

/**
 * A casa de quem está logado — equipe ou cliente.
 *
 * Reúne o que a pessoa tem na Avila Ops, uma seção por tela (`?secao=`, ver
 * `lib/secoesDaConta.ts`): no início, as caixas de e-mail (com um clique para o
 * webmail, que entra sozinho pelo SSO) e os sistemas a que tem acesso; depois
 * os dados dela; e as formas de entrar com a verificação em duas etapas.
 */
export default async function ContaPage({ searchParams }: { searchParams: Promise<{ erro?: string; provedor?: string; secao?: string | string[] }> }) {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login?returnTo=/conta");
  const { erro, provedor: provErro, secao: secaoPedida } = await searchParams;
  const secao = secaoDaConta(secaoPedida, erro);
  const SEGURANCA = enderecoDaSecao("seguranca");

  const [caixas, vinculos, ligados, permissoes, conta, fator] = await Promise.all([
    caixasDoDono(sessao.email),
    listarVinculos(sessao.sub),
    conectoresLigados(),
    listarPermissoes(sessao.email),
    buscarConta(sessao.sub),
    estadoSegundoFator(sessao.email),
  ]);

  // Mesma autorização do menu do ecossistema e do login. O acesso às empresas
  // continua sendo verificado por cada produto ao abrir o destino.
  const cadastro = await listarCadastro();
  const sistemas = menuDeApps(cadastro, sessao.papel, permissoes).apps
    .filter((app) => app.id !== "mail");
  const vinculados = new Set(vinculos.map((v) => v.provedor));
  const disponiveis = ligados.filter((p) => !vinculados.has(p.id));
  const primeiroNome = sessao.nome.split(" ")[0];

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="break-words text-2xl font-semibold tracking-tight">Olá, {primeiroNome}</h1>
          <p className="mt-1 break-words text-sm text-[var(--color-texto-fraco)]">
            {sessao.email} ·{" "}
            <span className={sessao.papel === "ADMIN" ? "text-[var(--color-marca)]" : ""}>
              {sessao.papel === "ADMIN" ? "equipe Avila Ops" : "cliente"}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          {ehSuperadmin(sessao) && (
            <Link href="/admin" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-borda)] px-3 py-1.5 hover:bg-[var(--color-cartao)]">Painel</Link>
          )}
          <form action="/api/auth/logout" method="post">
            <button className="min-h-11 rounded-lg border border-[var(--color-borda)] px-3 py-1.5 hover:bg-[var(--color-cartao)]">Sair</button>
          </form>
        </div>
      </header>

      <nav aria-label="Seções da conta" className="-mx-1 mb-6 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SECOES_DA_CONTA.map((s) => (
          <Link key={s.id} href={enderecoDaSecao(s.id)} aria-current={s.id === secao ? "page" : undefined} className={aba(s.id === secao)}>
            {s.rotulo}
          </Link>
        ))}
        <Link href="/conta/meta" className={aba(false)}>Meta</Link>
      </nav>

      {erro === "ja_usado" && (
        <p role="alert" className="mb-6 rounded-lg border border-[var(--color-marca-vermelho)]/40 bg-[var(--marca-vermelho-suave)] p-3 text-xs text-[var(--color-marca-vermelho)]">
          Essa conta {buscarProvedor(provErro)?.nome ?? ""} já está vinculada a outra pessoa.
        </p>
      )}

      <div className="flex flex-col gap-6">
        {secao === "inicio" && caixas.length > 0 && (
          <Cartao titulo="Seus e-mails" subtitulo="Abra o webmail sem digitar senha de novo — a sua sessão já vale lá.">
            <ul className="flex flex-col divide-y divide-[var(--color-borda)]">
              {caixas.map((c) => (
                <li key={c.address} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-borda)] bg-[var(--color-fundo)] text-[var(--color-texto-fraco)]">
                      <IconeProvedor id="mail" tamanho={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{c.address}</div>
                      <div className="text-xs text-[var(--color-texto-fraco)]">
                        {c.status === "active" ? "ativa" : c.status === "suspended" ? "suspensa" : "indisponível"}
                        {c.cotaBytes > 0 && ` · ${gb(c.usadoBytes)} de ${gb(c.cotaBytes)}`}
                      </div>
                      {c.cotaBytes > 0 && (
                        <div className="mt-1.5 h-1 w-full max-w-40 overflow-hidden rounded-full bg-[var(--color-fundo)]">
                          <div
                            className="h-full rounded-full bg-[var(--color-marca-solida)]"
                            style={{ width: `${Math.min(100, Math.round((c.usadoBytes / c.cotaBytes) * 100))}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <a
                    href={WEBMAIL}
                    className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-[var(--color-marca-solida)] px-3 py-1.5 text-sm font-semibold text-[var(--color-marca-contraste)] hover:opacity-90"
                  >
                    Abrir webmail
                  </a>
                </li>
              ))}
            </ul>
          </Cartao>
        )}

        {secao === "inicio" && (
          <SistemasDaConta sistemas={sistemas} />
        )}

        {secao === "dados" && (
        <Cartao titulo="Meus dados" subtitulo="Como você aparece para a equipe Avila Ops.">
          <form action={acaoMeusDados} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">
              Nome
              <input
                name="nome"
                defaultValue={conta?.nome ?? sessao.nome}
                required
                className="rounded-lg border border-[var(--color-borda)] bg-[var(--color-fundo)] px-3 py-2 text-sm text-[var(--color-texto)] outline-none focus:border-[var(--color-marca)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">
              Telefone
              <input
                name="telefone"
                defaultValue={conta?.telefone ?? ""}
                placeholder="(00) 00000-0000"
                className="rounded-lg border border-[var(--color-borda)] bg-[var(--color-fundo)] px-3 py-2 text-sm text-[var(--color-texto)] outline-none focus:border-[var(--color-marca)]"
              />
            </label>
            <div className="flex items-center gap-3 text-xs text-[var(--color-texto-fraco)]">
              <span>E-mail: {sessao.email}</span>
              {conta?.cpf && <span>· CPF: {conta.cpf}</span>}
            </div>
            <button
              type="submit"
              className="self-start rounded-lg bg-[var(--color-marca-solida)] px-4 py-2 text-sm font-semibold text-[var(--color-marca-contraste)] hover:opacity-90"
            >
              Salvar
            </button>
          </form>
        </Cartao>
        )}

        {secao === "seguranca" && (
        <>
        <Cartao titulo="Formas de entrar" subtitulo="Tudo aqui leva à mesma conta — entrar com senha ou com um destes é a mesma coisa.">
          <ul className="divide-y divide-[var(--color-borda)]">
            <li className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <div>Senha</div>
                <div className="text-xs text-[var(--color-texto-fraco)]">e-mail ou CPF + senha</div>
              </div>
              <Link href={`/trocar-senha?returnTo=${encodeURIComponent(SEGURANCA)}`} className="text-xs text-[var(--color-texto-fraco)] hover:text-[var(--color-texto)]">Trocar</Link>
            </li>
            {vinculos.map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <IconeProvedor id={v.provedor} tamanho={18} />
                  <div>
                    <div>{nomeProvedor(v.provedor)}</div>
                    <div className="text-xs text-[var(--color-texto-fraco)]">{v.email ?? v.nome ?? v.provedorUserId}</div>
                  </div>
                </div>
                <form action={acaoDesvincular}>
                  <input type="hidden" name="provedor" value={v.provedor} />
                  <button className="text-xs text-[var(--color-texto-fraco)] hover:text-[var(--color-marca-vermelho)]">Desvincular</button>
                </form>
              </li>
            ))}
          </ul>

          {disponiveis.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-xs text-[var(--color-texto-fraco)]">Adicionar</div>
              <BotoesSociais provedores={disponiveis} vincular returnTo={SEGURANCA} />
            </div>
          )}
        </Cartao>

        <Cartao
          titulo="Verificação em duas etapas"
          subtitulo="A senha prova quem você diz ser; o código no celular prova que é você mesmo."
        >
          <SegundoFator
            estado={{
              habilitado: mfaHabilitado(),
              ativo: fator.ativo,
              confirmadoEm: fator.confirmadoEm
                ? fator.confirmadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
                : null,
              codigosRestantes: fator.codigosRestantes,
              obrigatorio: exigeSegundoFator({ papel: sessao.papel }),
              disponivel: mfaDisponivel(),
            }}
          />
        </Cartao>
        </>
        )}
      </div>
    </main>
  );
}

function aba(ativa: boolean): string {
  return `flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm ${
    ativa ? "bg-[var(--color-marca-suave)] font-semibold text-[var(--color-marca)]" : "text-[var(--color-texto-fraco)] hover:bg-[var(--color-cartao)] hover:text-[var(--color-texto)]"
  }`;
}

function Cartao({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      {subtitulo && <p className="mb-4 mt-1 text-xs text-[var(--color-texto-fraco)]">{subtitulo}</p>}
      {!subtitulo && <div className="mb-3" />}
      {children}
    </section>
  );
}
