import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import IconeProvedor from "@/components/IconeProvedor";
import { ehSuperadmin } from "@/lib/admin";
import { listarCadastro } from "@/lib/cadastro";
import { caixasDoDono } from "@/lib/caixaEmail";
import { conectoresLigados } from "@/lib/conectores";
import { lerContaAutenticada } from "@/lib/contaAutenticada";
import { conexoesDaConta } from "@/lib/conexoesDaConta";
import { emailConfigurado } from "@/lib/email";
import { listarPermissoes } from "@/lib/permissoes";
import { appsDaConta, menuDeApps } from "@/lib/menuDeApps";
import { acessosDaConta } from "@/lib/acessosDaConta";
import { estado as estadoSegundoFator, exigeSegundoFator, mfaDisponivel, mfaHabilitado } from "@/lib/segundoFator";
import { buscarProvedor, nomeProvedor } from "@/lib/provedores";
import { enderecoDaSecao, paginaDaConta, secaoDaConta, SECOES_DA_CONTA } from "@/lib/secoesDaConta";
import { listarVinculos } from "@/lib/vinculos";
import BotoesSociais from "@/app/login/BotoesSociais";
import { acaoDesvincular, acaoMeusDados, acaoFotoPerfil, acaoRevogarConexao } from "./actions";
import { buscarFotoPerfil } from "@/lib/fotoPerfil";
import PerfilForm from "./PerfilForm";
import SegundoFator from "./SegundoFator";
import SistemasDaConta from "./SistemasDaConta";
import ContaShell from "./ContaShell";
import AcessosDaConta from "./AcessosDaConta";
import ConfirmacaoEmail from "./ConfirmacaoEmail";
import ConexoesDaConta from "./ConexoesDaConta";
import ResumoDaConta from "./ResumoDaConta";
import "./conta.css";

export const dynamic = "force-dynamic";
type Consulta = { erro?: string; provedor?: string; secao?: string | string[]; salvo?: string; pagina?: string | string[] };
type Props = { searchParams: Promise<Consulta> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { secao: pedida, erro } = await searchParams;
  const secao = secaoDaConta(pedida, erro);
  const titulo = SECOES_DA_CONTA.find((s) => s.id === secao)!.rotulo;
  return { title: secao === "inicio" ? "Conta" : `${titulo} • Conta`, applicationName: "Conta" };
}

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
export default async function ContaPage({ searchParams }: Props) {
  const { erro, provedor: provErro, secao: secaoPedida, salvo, pagina: pagPedida } = await searchParams;
  const secao = secaoDaConta(secaoPedida, erro);
  const pagina = paginaDaConta(pagPedida);
  const atual = await lerContaAutenticada();
  if (atual.tipo === "anonima") redirect(`/login?returnTo=${encodeURIComponent(enderecoDaSecao(secao))}`);
  if (atual.tipo !== "autenticada") redirect("/sair");
  const { sessao, conta } = atual;
  const SEGURANCA = enderecoDaSecao("seguranca");
  const fotoPerfil = await buscarFotoPerfil(sessao.sub);
  const fotoUrl = fotoPerfil ? `/api/conta/foto?v=${fotoPerfil.atualizadoEm.getTime()}` : null;

  const [caixas, vinculos, ligados, permissoes, fator] = await Promise.all([
    secao === "inicio" ? caixasDoDono(conta.email) : [],
    secao === "seguranca" ? listarVinculos(conta.id) : [],
    secao === "seguranca" ? conectoresLigados() : [],
    secao === "inicio" || secao === "empresas" ? listarPermissoes(conta.email) : [],
    secao === "inicio" || secao === "seguranca" ? estadoSegundoFator(conta.email) : { ativo: false, confirmadoEm: null, codigosRestantes: 0 },
  ]);

  // Mesma autorização do menu do ecossistema e do login. O acesso às empresas
  // continua sendo verificado por cada produto ao abrir o destino.
  const cadastro = secao === "inicio" || secao === "empresas" ? await listarCadastro() : [];
  const sistemas = menuDeApps(cadastro, sessao.papel, permissoes).apps
    .filter((app) => app.id !== "mail");
  const acessos = secao === "empresas" ? await acessosDaConta(conta.id, cadastro, appsDaConta(cadastro, sessao.papel, permissoes), pagina) : null;
  const conexoes = secao === "conexoes" ? await conexoesDaConta(conta.id, pagina) : null;
  const vinculados = new Set(vinculos.map((v) => v.provedor));
  const disponiveis = ligados.filter((p) => !vinculados.has(p.id));

  return (
    <ContaShell nome={conta.nome} email={conta.email} foto={fotoUrl} equipe={sessao.papel === "ADMIN"} painel={ehSuperadmin(sessao)} secao={secao}>

      {erro === "ja_usado" && (
        <p role="alert" className="mb-6 rounded-lg border border-[var(--color-marca-vermelho)]/40 bg-[var(--marca-vermelho-suave)] p-3 text-xs text-[var(--color-marca-vermelho)]">
          Essa conta {buscarProvedor(provErro)?.nome ?? ""} já está vinculada a outra pessoa.
        </p>
      )}

      <div className="flex flex-col gap-6">
        {secao === "inicio" && caixas.length > 0 && (
          <Cartao titulo="Seus e-mails" subtitulo="Sua sessão também vale no webmail. Abra sua caixa para continuar.">
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
                        {c.cotaBytes > 0 && ` • ${gb(c.usadoBytes)} de ${gb(c.cotaBytes)}`}
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
        {secao === "inicio" && <ResumoDaConta emailVerificado={conta.emailVerificado} autenticadorAtivo={fator.ativo} />}
        {acessos && <AcessosDaConta emailVerificado={conta.emailVerificado} pagina={pagina} {...acessos} />}
        {conexoes && <>
          {erro === "conexao" && <p role="alert" className="conta-alerta">Não foi possível revogar a conexão. Atualize a lista e tente novamente.</p>}
          {salvo === "conexao" && <p role="status" className="conta-retorno">Conexão revogada. Ela precisará de uma nova autorização para voltar a acessar seus dados.</p>}
          <ConexoesDaConta pagina={pagina} revogar={acaoRevogarConexao} {...conexoes} />
        </>}

        {secao === "dados" && (
        <Cartao titulo="Meus dados" subtitulo="Suas informações de identificação e contato.">
          {salvo === "1" && <p role="status" className="mb-4 rounded-lg border border-[var(--color-borda)] p-3 text-sm text-[var(--color-verde)]">Dados salvos com sucesso.</p>}
          {erro === "dados" && <p role="alert" className="mb-4 rounded-lg border border-[var(--color-borda)] p-3 text-sm text-[var(--color-marca-vermelho)]">Não foi possível salvar os dados. Tente novamente.</p>}
          {salvo === "foto" && <p role="status">Foto do perfil atualizada.</p>}
          {erro === "foto" && <p role="alert" className="perfil-erro">Não foi possível salvar a foto. Use JPG, PNG ou WebP de até 2 MB e tente novamente.</p>}
          <PerfilForm key={fotoUrl ?? "sem-foto"} nome={conta?.nome ?? sessao.nome} telefone={conta?.telefone ?? ""} email={sessao.email} foto={fotoUrl} salvarDados={acaoMeusDados} salvarFoto={acaoFotoPerfil}/>
        </Cartao>
        )}

        {secao === "seguranca" && (
        <>
        <Cartao titulo="Formas de entrar" subtitulo="Use sua senha ou um dos provedores vinculados para acessar a mesma conta.">
          <ul className="divide-y divide-[var(--color-borda)]">
            <li className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <div>Senha</div>
                <div className="text-xs text-[var(--color-texto-fraco)]">e-mail ou CPF + senha</div>
              </div>
              <Link href={`/trocar-senha?returnTo=${encodeURIComponent(SEGURANCA)}`} className="conta-botao">Trocar senha</Link>
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
                  <button className="conta-botao" type="submit">Desvincular</button>
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
          titulo="Aplicativo autenticador"
          subtitulo="Verificação em duas etapas com os códigos gerados no seu aplicativo."
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

        <ConfirmacaoEmail email={conta.email} confirmado={conta.emailVerificado} disponivel={emailConfigurado()} />
        </>
        )}
      </div>
    </ContaShell>
  );
}

function Cartao({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children?: React.ReactNode }) {
  return (
    <section className="conta-cartao">
      <h2>{titulo}</h2>
      {subtitulo && <p className="conta-cartao-descricao">{subtitulo}</p>}
      {!subtitulo && <div className="mb-3" />}
      {children}
    </section>
  );
}
