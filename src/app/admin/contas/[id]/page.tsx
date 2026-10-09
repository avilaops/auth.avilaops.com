import Link from "next/link";
import { notFound } from "next/navigation";
import IconeProvedor from "@/components/IconeProvedor";
import { listarApps } from "@/lib/cadastro";
import { caixasDoDono, dominiosHospedados } from "@/lib/caixaEmail";
import { buscarConta, papelDaRole } from "@/lib/contas";
import { listarEmpresas, participacoesDaConta } from "@/lib/empresas";
import { efeitoDoVinculo } from "@/lib/vinculoEmpresa";
import { listarEventos } from "@/lib/eventos";
import { descreverEvento } from "@/lib/eventosCatalogo";
import { listarPermissoes } from "@/lib/permissoes";
import { estado as estadoSegundoFator, exigeSegundoFator, mfaDisponivel } from "@/lib/segundoFator";
import { nomeProvedor } from "@/lib/provedores";
import { listarVinculos } from "@/lib/vinculos";
import {
  acaoCriarCaixa,
  acaoDefinirSenha,
  acaoDesvincularAdmin,
  acaoEditarConta,
  acaoGerarProvisoria,
  acaoLinkRecuperacao,
  acaoPermissao,
  acaoRemoverConta,
  acaoResetarMfa,
  acaoVincularEmpresaDaConta,
} from "../../actions";
import VinculoEmpresa from "../../_componentes/VinculoEmpresa";
import FormAcao from "../../_componentes/FormAcao";
import { botao, botaoFraco, campo } from "../../_componentes/estilos";
import Papel from "../../_componentes/Papel";
import { VoltarLista } from "../../_componentes/lista/Interativos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conta" };

function quando(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export default async function ContaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conta = await buscarConta(id);
  if (!conta) notFound();

  const [permissoes, eventos, vinculos, caixas, dominios, fator] = await Promise.all([
    listarPermissoes(conta.email),
    listarEventos({ email: conta.email, limite: 30 }),
    listarVinculos(conta.id),
    caixasDoDono(conta.email),
    dominiosHospedados(),
    estadoSegundoFator(conta.email),
  ]);
  // "Equipe" aqui é o que o login decide, não o nome do papel: o login entra
  // em tudo quando `papelDaRole` diz ADMIN, e isso vale para OWNER, SOCIO e
  // ADMIN. Comparar com a string "ADMIN" mostrava o Nicolas e o Abraão como
  // bloqueados no app.avilaops.com numa tela que devia mostrar o contrário.
  const ehAdmin = papelDaRole(conta.role) === "ADMIN";
  const [apps, empresas, participacoes] = await Promise.all([listarApps(), listarEmpresas(), participacoesDaConta(conta.id)]);
  const efeito = efeitoDoVinculo(conta.role, conta.ativa);
  const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(bytes >= 1024 ** 3 ? 0 : 1)} GB`;

  return (
    <div className="mx-auto min-w-0 max-w-5xl">
      <VoltarLista secao="contas" base="/admin">← Contas</VoltarLista>
      {/* Nome em cima, selos embaixo: lado a lado, um nome comprido empurrava os
          selos para fora da tela e a página inteira passava a rolar de lado. */}
      <div className="mt-2 mb-6">
        <h1 className="break-words text-xl font-semibold tracking-tight sm:text-2xl">{conta.nome}</h1>
        <p className="mt-0.5 break-all text-sm text-[var(--color-texto-fraco)]">{conta.email}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Papel role={conta.role} />
          {!conta.ativa && <span className="whitespace-nowrap rounded-full border border-[var(--color-borda)] px-2 py-0.5 text-xs text-[var(--color-texto-fraco)]">desligada</span>}
          {conta.senhaProvisoria && (
            <span className="whitespace-nowrap rounded-full bg-[var(--marca-amarelo-suave)] px-2 py-0.5 text-xs text-[var(--color-marca-amarelo)]">senha provisória</span>
          )}
        </div>
      </div>

      <div className="mb-6">
        <VinculoEmpresa
          acao={acaoVincularEmpresaDaConta}
          id={conta.id}
          atual={conta.organizationId}
          empresas={empresas}
          explicacao="A empresa que esta conta representa. São três coisas separadas: o perfil (o que a pessoa é), este vínculo (de qual empresa ela é) e as permissões de aplicação, mais abaixo. O vínculo aceita uma empresa só."
          efeito={{ texto: efeito.descricao, concedeAcesso: efeito.concedeAcesso }}
          confirmacao={efeito.concedeAcesso ? "Entendo que salvar muda o acesso desta conta aos dados da empresa no portal (concede ao vincular, revoga ao retirar)." : undefined}
        >
          <div className="mb-3 rounded-lg border border-[var(--color-borda)] p-3 text-xs">
            <div className="mb-1 font-medium">Acesso a empresas em vigor</div>
            {participacoes === null ? (
              <p className="text-[var(--color-texto-fraco)]">Este painel não conseguiu ler as participações no banco do app.avilaops.com.</p>
            ) : participacoes.length === 0 ? (
              <p className="text-[var(--color-texto-fraco)]">Nenhum. Esta conta não abre os dados de nenhuma empresa no portal.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {participacoes.map((p) => (
                  <li key={p.organizacaoId} className="flex flex-wrap justify-between gap-x-3">
                    <span>{p.empresa}</span>
                    <span className="text-[var(--color-texto-fraco)]">
                      {p.papel === "ADMIN" ? "administrador" : "membro"} · {p.situacao === "ACTIVE" ? (p.emVigor ? "ativo" : "ativo no cadastro, sem efeito agora") : p.situacao === "SUSPENDED" ? "suspenso" : p.situacao.toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </VinculoEmpresa>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
          <h2 className="mb-4 text-sm font-semibold">Dados</h2>
          <FormAcao acao={acaoEditarConta}>
            <input type="hidden" name="id" value={conta.id} />
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Nome
              <input name="nome" defaultValue={conta.nome} required className={campo} /></label>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">E-mail
              <input name="email" type="email" defaultValue={conta.email} required className={campo} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">CPF
                <input name="cpf" defaultValue={conta.cpf ?? ""} className={campo} /></label>
              <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Telefone
                <input name="telefone" defaultValue={conta.telefone ?? ""} className={campo} /></label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Papel
              <select name="role" defaultValue={conta.role} className={campo}>
                <option value="CLIENT">Equipe do cliente (usa o produto)</option>
                <option value="ADMIN">Dono do negócio (manda na própria empresa)</option>
                <option value="SOCIO">Sócio da Avila Ops (opera tudo, menos o caixa)</option>
                <option value="OWNER">Plataforma Avila Ops (acesso a tudo)</option>
              </select></label>
            <div className="break-all text-xs text-[var(--color-texto-fraco)]">Criada em {quando(conta.criadoEm)} · id {conta.id}</div>
            <button type="submit" className={botao}>Salvar</button>
          </FormAcao>
        </section>

        <section className="flex flex-col gap-6">
          <div className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
            <h2 className="mb-1 text-sm font-semibold">Senha</h2>
            <p className="mb-4 text-xs text-[var(--color-texto-fraco)]">
              A senha é guardada como hash (bcrypt) e não pode ser lida. O que dá para fazer é definir outra.
            </p>
            <FormAcao acao={acaoDefinirSenha} className="mb-4 flex flex-col gap-2">
              <input type="hidden" name="id" value={conta.id} />
              <div className="flex gap-2">
                <input name="senha" type="text" placeholder="Nova senha (mín. 8)" minLength={8} required className={campo} autoComplete="off" />
                <button type="submit" className={botaoFraco}>Definir</button>
              </div>
              <label className="flex items-center gap-2 text-xs text-[var(--color-texto-fraco)]">
                <input type="checkbox" name="provisoria" defaultChecked /> obrigar troca no próximo login
              </label>
            </FormAcao>
            <div className="flex flex-wrap gap-2">
              <FormAcao acao={acaoGerarProvisoria} className="contents">
                <input type="hidden" name="id" value={conta.id} />
                <button type="submit" className={botaoFraco}>Gerar senha provisória</button>
              </FormAcao>
              <FormAcao acao={acaoLinkRecuperacao} className="contents">
                <input type="hidden" name="id" value={conta.id} />
                <button type="submit" className={botaoFraco}>Gerar link de recuperação</button>
              </FormAcao>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
            <h2 className="mb-1 text-sm font-semibold">Verificação em duas etapas</h2>
            <p className="mb-3 text-xs text-[var(--color-texto-fraco)]">
              Código de 6 dígitos, trocado a cada 30 segundos, no celular da pessoa. O segredo é dela: o painel
              vê o estado e pode remover, nunca ler.
            </p>
            {!mfaDisponivel() ? (
              <p className="text-xs leading-relaxed text-red-400">
                Indisponível: falta <code>AUTH_ENCRYPTION_KEY</code> no servidor. Enquanto isso, a
                exigência fica suspensa e todo mundo entra só com a senha.
              </p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  {fator.ativo ? (
                    <>
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400">ativa</span>
                      <span className="text-[var(--color-texto-fraco)]">
                        {fator.confirmadoEm && `desde ${quando(fator.confirmadoEm)} · `}
                        {fator.codigosRestantes} de recuperação restantes
                        {fator.ultimoUsoEm && ` · último uso ${quando(fator.ultimoUsoEm)}`}
                      </span>
                    </>
                  ) : fator.pendente ? (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-400">cadastro não concluído</span>
                  ) : (
                    <span className="text-[var(--color-texto-fraco)]">
                      não ativada
                      {exigeSegundoFator({ papel: papelDaRole(conta.role) }) && " — obrigatória; será pedida no próximo login"}
                    </span>
                  )}
                </div>
                {(fator.ativo || fator.pendente) && (
                  <FormAcao acao={acaoResetarMfa} className="flex flex-col gap-2">
                    <input type="hidden" name="id" value={conta.id} />
                    <button type="submit" className={botaoFraco}>Remover (perdeu o aparelho)</button>
                    <span className="text-xs text-[var(--color-texto-fraco)]">
                      Confirme com a pessoa por um canal fora do e-mail antes de remover.
                    </span>
                  </FormAcao>
                )}
              </>
            )}
          </div>

          <div className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
            <h2 className="mb-1 text-sm font-semibold">Formas de entrar</h2>
            <p className="mb-3 text-xs text-[var(--color-texto-fraco)]">
              Senha sempre. Logins sociais vinculados a esta conta — tudo leva à mesma pessoa.
            </p>
            {vinculos.length === 0 ? (
              <p className="text-xs text-[var(--color-texto-fraco)]">Nenhum login social vinculado.</p>
            ) : (
              <ul className="divide-y divide-[var(--color-borda)]">
                {vinculos.map((v) => {
                        return (
                    <li key={v.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <IconeProvedor id={v.provedor} tamanho={18} />
                        <div>
                          <div>{nomeProvedor(v.provedor)}</div>
                          <div className="text-xs text-[var(--color-texto-fraco)]">
                            {v.email ?? v.provedorUserId}
                            {v.ultimoLogin && ` · último uso ${quando(v.ultimoLogin)}`}
                          </div>
                        </div>
                      </div>
                      <form action={acaoDesvincularAdmin}>
                        <input type="hidden" name="id" value={conta.id} />
                        <input type="hidden" name="provedor" value={v.provedor} />
                        <button type="submit" className={botaoFraco}>Desvincular</button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
            <h2 className="mb-1 text-sm font-semibold">Caixas de e-mail</h2>
            <p className="mb-3 text-xs text-[var(--color-texto-fraco)]">
              Caixas no Avila Mail de que esta conta é dona (abre em mail.avilaops.com pelo login único).
            </p>
            {caixas.length === 0 ? (
              <p className="mb-3 text-xs text-[var(--color-texto-fraco)]">Nenhuma caixa ainda.</p>
            ) : (
              <ul className="mb-3 divide-y divide-[var(--color-borda)]">
                {caixas.map((c) => (
                  <li key={c.address} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div>
                      <div>{c.address}</div>
                      <div className="text-xs text-[var(--color-texto-fraco)]">
                        {c.displayName ? `${c.displayName} · ` : ""}
                        {gb(c.usadoBytes)} de {gb(c.cotaBytes)}
                      </div>
                    </div>
                    <span className={`text-xs ${c.status === "active" ? "text-emerald-400" : "text-amber-400"}`}>
                      {c.status === "active" ? "ativa" : c.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {dominios.length > 0 && (
              <FormAcao acao={acaoCriarCaixa} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={conta.id} />
                <div className="flex flex-wrap gap-2 [&>input]:min-w-0 [&>input]:flex-1 [&>select]:min-w-0 [&>select]:flex-1 [&>*]:basis-32">
                  <input
                    name="caixaUsuario"
                    placeholder={conta.email.split("@")[0]}
                    className={campo}
                    autoComplete="off"
                  />
                  <select name="caixaDominio" defaultValue="" className={campo}>
                    <option value="">@ domínio…</option>
                    {dominios.map((d) => (
                      <option key={d} value={d}>@{d}</option>
                    ))}
                  </select>
                  <button type="submit" className={botaoFraco}>Criar caixa</button>
                </div>
                <p className="text-xs text-[var(--color-texto-fraco)]">
                  A caixa nasce com senha provisória própria, mostrada uma vez; troca obrigatória no primeiro acesso. Criação pelo n8n.
                </p>
              </FormAcao>
            )}
          </div>

          <div className="rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
            <h2 className="mb-1 text-sm font-semibold">Acesso às aplicações</h2>
            <p className="mb-4 text-xs text-[var(--color-texto-fraco)]">
              {ehAdmin
                ? "Equipe entra em todas as aplicações."
                : "Cliente entra nos apps abertos automaticamente; apps restritos precisam de liberação aqui."}
            </p>
            <ul className="flex flex-col divide-y divide-[var(--color-borda)]">
              {apps.map((app) => {
                const bloqueadoPorPapel = app.papelExigido === "ADMIN" && !ehAdmin;
                const liberado = ehAdmin || (!bloqueadoPorPapel && (!app.restrito || permissoes.includes(app.id)));
                const explicito = permissoes.includes(app.id);
                return (
                  <li key={app.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div>
                      <div>{app.nome}</div>
                      <div className="text-xs text-[var(--color-texto-fraco)]">
                        {app.host}
                        {app.papelExigido === "ADMIN" && " · só equipe"}
                        {app.restrito && " · restrito"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${liberado ? "text-emerald-400" : "text-[var(--color-texto-fraco)]"}`}>
                        {liberado ? "liberado" : "sem acesso"}
                      </span>
                      {!ehAdmin && !bloqueadoPorPapel && (
                        <FormAcao acao={acaoPermissao} className="contents">
                          <input type="hidden" name="id" value={conta.id} />
                          <input type="hidden" name="appId" value={app.id} />
                          <input type="hidden" name="acao" value={explicito ? "revogar" : "conceder"} />
                          <button type="submit" className={botaoFraco}>{explicito ? "Revogar" : "Liberar"}</button>
                        </FormAcao>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
        <h2 className="mb-4 text-sm font-semibold">Atividade recente</h2>
        {eventos.length === 0 ? (
          <p className="text-xs text-[var(--color-texto-fraco)]">Nada registrado ainda.</p>
        ) : (
          // No celular cada evento é um bloco (o quê, depois quando e os
          // detalhes); três colunas lado a lado em 390px quebravam palavra por
          // palavra. O nome é o do catálogo, não o código interno do evento.
          <ul className="flex flex-col divide-y divide-[var(--color-separador)] text-xs">
            {eventos.map((e) => {
              const detalhes = [e.appId, e.detalhe, e.autor && e.autor !== e.email ? `por ${e.autor}` : null, e.ip].filter(Boolean).join(" · ");
              return (
                <li key={e.id} className="grid gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[8rem_14rem_minmax(0,1fr)] sm:py-1.5">
                  <span className="font-medium sm:order-2">{descreverEvento(e.tipo).rotulo}</span>
                  <span className="text-[var(--color-texto-fraco)] sm:order-1">{quando(e.criadoEm)}</span>
                  {detalhes && <span className="break-words text-[var(--color-texto-fraco)] sm:order-3">{detalhes}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-[var(--color-marca-vermelho)]/40 p-6">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-marca-vermelho)]">Remover conta</h2>
        <p className="mb-3 text-xs text-[var(--color-texto-fraco)]">
          Não tem volta: a conta, as liberações de aplicação e os logins sociais dela deixam de existir. Conta que já participou de uma
          empresa, tem pedidos ou autorizou conexões não pode ser removida; para essas, o caminho é desligar.
        </p>
        <FormAcao acao={acaoRemoverConta}>
          <input type="hidden" name="id" value={conta.id} />
          <label className="flex min-h-11 cursor-pointer items-start gap-2 text-xs">
            <input type="checkbox" name="confirmar" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Entendo que remover <span className="break-all font-medium">{conta.email}</span> não tem volta.</span>
          </label>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center self-start rounded-lg border border-[var(--color-marca-vermelho)]/60 px-4 py-2 text-sm text-[var(--color-marca-vermelho)] hover:bg-[var(--marca-vermelho-suave)] disabled:opacity-60"
          >
            Remover conta
          </button>
        </FormAcao>
      </section>
    </div>
  );
}
