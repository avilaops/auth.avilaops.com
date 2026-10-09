import Link from "next/link";
import { exigirAdmin } from "@/lib/admin";
import { listarCadastro } from "@/lib/cadastro";
import { listarIntegracoes, type Integracao } from "@/lib/clientesOidc";
import { empresasDasAplicacoes, listarEmpresas, ROTULO_SEM_EMPRESA, SEM_EMPRESA } from "@/lib/empresas";
import { agrupar, consultarEmMemoria, dataHora, filtrosAtivos, lerConsulta, paginar, type Consulta, type DefLista } from "@/lib/listagem";
import { baseUrl } from "@/lib/urls";
import FormAcao from "../_componentes/FormAcao";
import { botao, campo } from "../_componentes/estilos";
import BarraLista from "../_componentes/lista/BarraLista";
import { ExpandirGrupos, ItemIndisponivel, itemDeMenu, MenuAcoes } from "../_componentes/lista/Interativos";
import { celula, Estado, linha, moldura, Paginacao, Resumo, SecaoGrupo, secundario, Th, Vazio } from "../_componentes/lista/Partes";
import { acaoCriarIntegracao } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Integrações" };

const BASE = "/admin/integracoes";
type Params = Record<string, string | string[] | undefined>;
type Linha = Integracao & { appNome: string; empresaId: string | null; empresaNome: string | null; uso: "oidc" | "api" };

/**
 * Sistemas que se conectam ao auth com credencial própria: login por OIDC
 * (TMS, Notas, software de terceiro) e leitura das conexões da Meta.
 *
 * A empresa de uma integração é a da aplicação a que ela pertence. O segredo
 * nunca aparece aqui: ele só existe em claro na tela em que é gerado.
 */
export default async function IntegracoesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const [sessao, integracoes, apps, empresas, vinculos] = await Promise.all([exigirAdmin(BASE), listarIntegracoes(), listarCadastro(), listarEmpresas(), empresasDasAplicacoes()]);
  const nomeApp = new Map(apps.map((a) => [a.id, a.nome]));
  const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  const base = baseUrl();

  const todas: Linha[] = integracoes.map((i) => {
    const empresaId = vinculos.get(i.appId) ?? null;
    return { ...i, appNome: nomeApp.get(i.appId) ?? i.appId, empresaId, empresaNome: empresaId ? (nomeEmpresa.get(empresaId) ?? null) : null, uso: i.redirectUris.length > 0 ? "oidc" : "api" };
  });
  const appsUsados = [...new Set(todas.map((i) => i.appId))];
  const empresasUsadas = new Set(todas.map((i) => i.empresaId).filter(Boolean));

  const def: DefLista = {
    filtros: [
      { chave: "app", rotulo: "Aplicação", tipo: "multi", opcoes: appsUsados.map((id) => ({ valor: id, rotulo: nomeApp.get(id) ?? id })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR")) },
      { chave: "empresa", rotulo: "Empresa", tipo: "multi", opcoes: [...empresas.filter((e) => empresasUsadas.has(e.id)).map((e) => ({ valor: e.id, rotulo: e.nome })), { valor: SEM_EMPRESA, rotulo: ROTULO_SEM_EMPRESA }] },
      { chave: "situacao", rotulo: "Situação", tipo: "unico", opcoes: [{ valor: "ativa", rotulo: "Ativa" }, { valor: "desativada", rotulo: "Desativada" }] },
      { chave: "uso", rotulo: "Tipo", tipo: "unico", opcoes: [{ valor: "oidc", rotulo: "Login por OIDC" }, { valor: "api", rotulo: "Só API" }] },
      { chave: "meta", rotulo: "Conexões da Meta", tipo: "unico", opcoes: [{ valor: "sim", rotulo: "Pode ler" }, { valor: "nao", rotulo: "Não pode ler" }] },
      { chave: "origem", rotulo: "Origem", tipo: "unico", opcoes: [{ valor: "painel", rotulo: "Cadastrada no painel" }, { valor: "codigo", rotulo: "Fixa no código" }] },
    ],
    ordens: [
      { campo: "nome", rotulo: "Nome" },
      { campo: "app", rotulo: "Aplicação" },
      { campo: "empresa", rotulo: "Empresa" },
      { campo: "situacao", rotulo: "Situação", rotulos: ["ativas primeiro", "desativadas primeiro"] },
      { campo: "atualizado", rotulo: "Última alteração", padrao: "desc", rotulos: ["mais antiga", "mais recente"] },
    ],
    grupos: [
      { valor: "empresa", rotulo: "Empresa" },
      { valor: "app", rotulo: "Aplicação" },
      { valor: "situacao", rotulo: "Situação" },
    ],
    ordemInicial: { campo: "nome", dir: "asc" },
  };
  const consulta = lerConsulta(params, def);
  const encontradas = consultarEmMemoria(todas, consulta, {
    id: (i) => i.id,
    busca: (i) => [i.nome, i.id, i.appNome, i.empresaNome],
    filtro: (i, chave) =>
      chave === "app" ? [i.appId]
      : chave === "empresa" ? [i.empresaId ?? SEM_EMPRESA]
      : chave === "situacao" ? [i.ativo ? "ativa" : "desativada"]
      : chave === "uso" ? [i.uso]
      : chave === "meta" ? [i.acessoMeta ? "sim" : "nao"]
      : chave === "origem" ? [i.origem]
      : [],
    ordem: (i, campo) => (campo === "app" ? i.appNome : campo === "empresa" ? i.empresaNome : campo === "situacao" ? (i.ativo ? 0 : 1) : campo === "atualizado" ? i.atualizadoEm : i.nome),
  });

  const grupos = !consulta.grupo ? null
    : consulta.grupo === "app" ? agrupar(encontradas, (i) => ({ chave: i.appId, rotulo: i.appNome }))
    : consulta.grupo === "situacao" ? agrupar(encontradas, (i) => (i.ativo ? { chave: "ativa", rotulo: "Ativas" } : { chave: "desativada", rotulo: "Desativadas" }), ["ativa", "desativada"])
    : agrupar(encontradas, (i) => (i.empresaId ? { chave: i.empresaId, rotulo: i.empresaNome ?? "Empresa não encontrada" } : { chave: "", rotulo: ROTULO_SEM_EMPRESA }));

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
          <Resumo encontrados={encontradas.length} total={todas.length} um="integração" varios="integrações" complemento="cada sistema entra com identificador e segredo próprios" />
        </div>
        <a href="#nova-integracao" className={`${botao} shrink-0 whitespace-nowrap`}>+ Nova integração</a>
      </div>

      <BarraLista
        secao="integracoes"
        usuario={sessao.email}
        def={def}
        consulta={consulta}
        placeholder="Buscar por nome, identificador ou aplicação"
        colunas={[{ id: "app", rotulo: "Aplicação" }, { id: "empresa", rotulo: "Empresa" }, { id: "uso", rotulo: "Tipo" }, { id: "atualizado", rotulo: "Última alteração" }]}
      />

      <div id="lista-integracoes">
        {encontradas.length === 0 ? (
          <Vazio filtrado={Boolean(consulta.q) || filtrosAtivos(consulta) > 0} base={BASE} semCadastro="Nenhuma integração ainda." acao={<a href="#nova-integracao" className={botao}>Criar a primeira</a>} />
        ) : grupos ? (
          <>
            <ExpandirGrupos alvo="lista-integracoes" />
            {grupos.map((g) => (
              <SecaoGrupo key={g.chave || "sem"} rotulo={g.rotulo} quantidade={g.itens.length} um="integração" varios="integrações">
                <Integracoes linhas={g.itens} consulta={consulta} def={def} semMoldura />
              </SecaoGrupo>
            ))}
          </>
        ) : (
          (() => {
            const pagina = paginar(encontradas, consulta.pag, consulta.por);
            return (
              <>
                <Integracoes linhas={pagina.itens} consulta={consulta} def={def} />
                <Paginacao pagina={pagina} base={BASE} consulta={consulta} def={def} rotulo="integrações" />
              </>
            );
          })()
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section id="nova-integracao" className="scroll-mt-24 rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-5">
          <h2 className="mb-4 text-sm font-semibold">Nova integração</h2>
          <FormAcao acao={acaoCriarIntegracao}>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Identificador (client_id)
              <input name="id" required placeholder="crm" className={`${campo} font-mono`} autoComplete="off" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Nome
              <input name="nome" required placeholder="CRM" className={campo} autoComplete="off" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Aplicação
              <select name="appId" required defaultValue="" className={campo}>
                <option value="" disabled>Escolha…</option>
                {apps.map((a) => <option key={a.id} value={a.id}>{a.nome} ({a.id})</option>)}
              </select>
              <span className="text-[11px]">É o cadastro dela que decide quem pode entrar.</span>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]">Endereços de retorno (um por linha)
              <textarea name="redirectUris" rows={3} placeholder="https://crm.avilaops.com/api/auth/callback" className={`${campo} font-mono text-xs`} />
            </label>
            <label className="flex min-h-11 items-start gap-2 text-xs">
              <input type="checkbox" name="acessoMeta" className="mt-0.5" />
              <span>Pode ler as conexões da Meta dos clientes<span className="block text-[11px] text-[var(--color-texto-fraco)]">Entrega o token de Páginas, WhatsApp e anúncios. Só para sistema da casa.</span></span>
            </label>
            <button type="submit" className={botao}>Criar e gerar segredo</button>
          </FormAcao>
        </section>

        <section className="h-fit rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-5 text-xs text-[var(--color-texto-fraco)]">
          <h2 className="mb-3 text-sm font-semibold text-[var(--color-texto)]">O que passar para o sistema</h2>
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[150px_1fr]">
            <dt>Descoberta OIDC</dt><dd><code className="select-all break-all">{base}/.well-known/openid-configuration</code></dd>
            <dt>Autorização</dt><dd><code className="select-all break-all">{base}/oauth/authorize</code></dd>
            <dt>Token</dt><dd><code className="select-all break-all">{base}/oauth/token</code></dd>
            <dt>Dados do usuário</dt><dd><code className="select-all break-all">{base}/oauth/userinfo</code></dd>
            <dt>Conexões da Meta</dt><dd><code className="select-all break-all">{base}/api/meta/ativos?email=…</code> (Basic com identificador e segredo)</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}

function Acoes({ i }: { i: Linha }) {
  return (
    <MenuAcoes rotulo={i.nome}>
      {i.origem === "painel"
        ? <Link role="menuitem" href={`/admin/integracoes/${i.id}`} className={itemDeMenu}>Abrir a ficha</Link>
        : <ItemIndisponivel motivo="Esta integração é fixa no código; muda por deploy.">Abrir a ficha</ItemIndisponivel>}
      <Link role="menuitem" href={`/admin/apps/${i.appId}`} className={itemDeMenu}>Abrir a aplicação</Link>
      <Link role="menuitem" href={`/admin/eventos?f_app=${encodeURIComponent(i.appId)}`} className={itemDeMenu}>Ver a atividade da aplicação</Link>
    </MenuAcoes>
  );
}

function Nome({ i }: { i: Linha }) {
  return i.origem === "painel"
    ? <Link href={`/admin/integracoes/${i.id}`} className="block truncate font-medium hover:text-[var(--color-marca)]">{i.nome}</Link>
    : <span className="block truncate font-medium">{i.nome}</span>;
}

/** No celular a linha inteira abre a ficha; integração fixa no código não tem ficha. */
function ItemMovel({ i, children }: { i: Linha; children: React.ReactNode }) {
  const classe = "min-w-0 flex-1 px-3 py-2.5";
  return i.origem === "painel"
    ? <Link href={`/admin/integracoes/${i.id}`} className={`${classe} active:bg-[var(--color-cartao)]`}>{children}</Link>
    : <div className={classe}>{children}</div>;
}

function Integracoes({ linhas, consulta, def, semMoldura }: { linhas: Linha[]; consulta: Consulta; def: DefLista; semMoldura?: boolean }) {
  const th = { base: BASE, consulta, def };
  return (
    <>
      <ul className={`divide-y divide-[var(--color-borda)] md:hidden ${semMoldura ? "" : moldura}`}>
        {linhas.map((i) => (
          <li key={i.id} className="flex items-stretch gap-1 bg-[var(--color-fundo)]">
            <ItemMovel i={i}>
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-medium">{i.nome}</span>
                {i.ativo ? <Estado tom="bom">Ativa</Estado> : <Estado tom="neutro">Desativada</Estado>}
              </div>
              <div className={secundario}><code>{i.id}</code> · {i.appNome}</div>
              <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-[var(--color-texto-fraco)]">
                <span>{i.uso === "oidc" ? "Login por OIDC" : "Só API"}</span>
                {i.acessoMeta && <span>· lê a Meta</span>}
                <span className="min-w-0 truncate">· {i.empresaNome ?? "Sem empresa"}</span>
              </div>
            </ItemMovel>
            <div className="flex items-center pr-1"><Acoes i={i} /></div>
          </li>
        ))}
      </ul>

      <div className={`hidden md:block ${semMoldura ? "" : moldura}`}>
        <table className="w-full text-sm">
          <caption className="sr-only">Integrações cadastradas</caption>
          <thead className="bg-[var(--color-cartao)]">
            <tr>
              <Th {...th} campo="nome">Integração</Th>
              <Th {...th} campo="app" col="app">Aplicação</Th>
              <Th {...th} campo="empresa" col="empresa" className="hidden xl:table-cell">Empresa</Th>
              <Th {...th} col="uso" className="w-40">Tipo</Th>
              <Th {...th} campo="situacao" className="w-28">Situação</Th>
              <Th {...th} campo="atualizado" col="atualizado" className="hidden w-44 2xl:table-cell">Última alteração</Th>
              <th scope="col" className="w-12 px-1"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((i) => (
              <tr key={i.id} className={linha}>
                <td className={`${celula} max-w-0`}>
                  <Nome i={i} />
                  <div data-secundario className={secundario}><code>{i.id}</code>{i.origem === "codigo" ? " · fixa no código" : ""}</div>
                </td>
                <td data-col="app" className={`${celula} max-w-0`}><Link href={`/admin/apps/${i.appId}`} className="block truncate hover:text-[var(--color-marca)]">{i.appNome}</Link></td>
                <td data-col="empresa" className={`${celula} hidden max-w-0 xl:table-cell`}>
                  {i.empresaId ? <span className="block truncate">{i.empresaNome ?? "Empresa não encontrada"}</span> : <span className="text-xs text-[var(--color-texto-apagado)]">Sem empresa vinculada</span>}
                </td>
                <td data-col="uso" className={`${celula} text-xs`}>
                  {i.uso === "oidc" ? "Login por OIDC" : "Só API"}
                  {i.acessoMeta && <span data-secundario className="block text-[var(--color-texto-fraco)]">Lê as conexões da Meta</span>}
                </td>
                <td className={celula}>{i.ativo ? <Estado tom="bom">Ativa</Estado> : <Estado tom="neutro">Desativada</Estado>}</td>
                <td data-col="atualizado" className={`${celula} hidden text-xs text-[var(--color-texto-fraco)] 2xl:table-cell`}>
                  <span className="tabular-nums">{dataHora(i.atualizadoEm, "Sem registro")}</span>
                  {i.atualizadoPor && <span data-secundario className="block truncate">por {i.atualizadoPor}</span>}
                </td>
                <td className="px-1 text-right"><Acoes i={i} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
