import Link from "next/link";
import { exigirAdmin } from "@/lib/admin";
import { recebeLogin, SITUACOES, type Situacao } from "@/lib/apps";
import { listarCadastro } from "@/lib/cadastro";
import { empresasDasAplicacoes, listarEmpresas, ROTULO_SEM_EMPRESA, SEM_EMPRESA } from "@/lib/empresas";
import { agrupar, consultarEmMemoria, filtrosAtivos, lerConsulta, paginar, paraParams, plural, type Consulta, type DefLista } from "@/lib/listagem";
import { permissoesPorApp } from "@/lib/permissoes";
import { botao } from "../_componentes/estilos";
import BarraLista, { type Atalho } from "../_componentes/lista/BarraLista";
import { ExpandirGrupos, ItemIndisponivel, itemDeMenu, MenuAcoes } from "../_componentes/lista/Interativos";
import { celula, Estado, linha, moldura, Paginacao, Resumo, SecaoGrupo, secundario, Th, Vazio } from "../_componentes/lista/Partes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aplicações" };

const BASE = "/admin/apps";
type Params = Record<string, string | string[] | undefined>;
type Acesso = "equipe" | "liberados" | "aberto" | "sem";

type App = {
  id: string;
  nome: string;
  host: string;
  tipo: "app" | "site";
  situacao: Situacao;
  /** Recebe sessão do login único (site e desativado não recebem). */
  login: boolean;
  acesso: Acesso;
  deepLink: string | null;
  liberados: string[];
  empresaId: string | null;
  empresaNome: string | null;
};

/**
 * A situação é o que alguém da equipe informou no cadastro. Não há sonda
 * conferindo se o endereço responde: a coluna diz "informada" para ninguém ler
 * "no ar" como monitoramento.
 */
const SITUACAO: Record<Situacao, { texto: string; tom: "bom" | "ruim" | "info" | "neutro" }> = {
  no_ar: { texto: "No ar", tom: "bom" },
  fora_do_ar: { texto: "Fora do ar", tom: "ruim" },
  planejado: { texto: "Planejada", tom: "info" },
  desativado: { texto: "Desativada", tom: "neutro" },
};
const ACESSO: Record<Acesso, string> = {
  equipe: "Só a equipe",
  liberados: "Equipe e clientes liberados",
  aberto: "Equipe e qualquer cliente",
  sem: "Não se aplica",
};

function urlLogin(app: App) {
  return `https://auth.avilaops.com/login?app=${app.id}&returnTo=https://${app.host}/`;
}

export default async function AppsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const [sessao, cadastro, porApp, empresas, vinculos] = await Promise.all([
    exigirAdmin(BASE),
    listarCadastro(),
    permissoesPorApp(),
    listarEmpresas(),
    empresasDasAplicacoes(),
  ]);
  const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));

  const todas: App[] = cadastro.map((c) => {
    const login = recebeLogin(c);
    const empresaId = vinculos.get(c.id) ?? null;
    return {
      id: c.id,
      nome: c.nome,
      host: c.host,
      tipo: c.tipo,
      situacao: c.situacao,
      login,
      acesso: !login ? "sem" : c.papelExigido === "ADMIN" ? "equipe" : c.restrito ? "liberados" : "aberto",
      deepLink: c.deepLink,
      liberados: porApp[c.id] ?? [],
      empresaId,
      empresaNome: empresaId ? (nomeEmpresa.get(empresaId) ?? null) : null,
    };
  });

  const comApp = new Set(todas.map((a) => a.empresaId).filter(Boolean));
  const def: DefLista = {
    filtros: [
      { chave: "empresa", rotulo: "Empresa", tipo: "multi", opcoes: [...empresas.filter((e) => comApp.has(e.id)).map((e) => ({ valor: e.id, rotulo: e.nome })), { valor: SEM_EMPRESA, rotulo: ROTULO_SEM_EMPRESA }] },
      { chave: "situacao", rotulo: "Situação informada", tipo: "multi", opcoes: SITUACOES.map((s) => ({ valor: s, rotulo: SITUACAO[s].texto })) },
      { chave: "login", rotulo: "Login único", tipo: "unico", opcoes: [{ valor: "sim", rotulo: "Habilitado" }, { valor: "nao", rotulo: "Desabilitado" }] },
      { chave: "acesso", rotulo: "Quem pode entrar", tipo: "multi", opcoes: (["equipe", "liberados", "aberto"] as const).map((a) => ({ valor: a, rotulo: ACESSO[a] })) },
      { chave: "tipo", rotulo: "Categoria", tipo: "unico", opcoes: [{ valor: "app", rotulo: "Aplicação" }, { valor: "site", rotulo: "Site" }] },
    ],
    ordens: [
      { campo: "nome", rotulo: "Nome" },
      { campo: "host", rotulo: "Domínio" },
      { campo: "empresa", rotulo: "Empresa" },
      { campo: "situacao", rotulo: "Situação", rotulos: ["no ar primeiro", "desativadas primeiro"] },
    ],
    grupos: [
      { valor: "empresa", rotulo: "Empresa" },
      { valor: "situacao", rotulo: "Situação" },
      { valor: "tipo", rotulo: "Categoria" },
    ],
    ordemInicial: { campo: "nome", dir: "asc" },
  };
  const consulta = lerConsulta(params, def);

  const encontradas = consultarEmMemoria(todas, consulta, {
    id: (a) => a.id,
    busca: (a) => [a.nome, a.host, a.id, a.empresaNome],
    filtro: (a, chave) =>
      chave === "empresa" ? [a.empresaId ?? SEM_EMPRESA]
      : chave === "situacao" ? [a.situacao]
      : chave === "login" ? [a.login ? "sim" : "nao"]
      : chave === "acesso" ? [a.acesso]
      : chave === "tipo" ? [a.tipo]
      : [],
    ordem: (a, campo) => (campo === "host" ? a.host : campo === "empresa" ? a.empresaNome : campo === "situacao" ? SITUACOES.indexOf(a.situacao) : a.nome),
  });
  const filtrado = Boolean(consulta.q) || filtrosAtivos(consulta) > 0;

  const com = (filtros: Record<string, string[]>) => {
    const p = paraParams({ ...consulta, q: "", filtros, pag: 1 }, def);
    return p.size > 0 ? `${BASE}?${p.toString()}` : BASE;
  };
  const so = (chave: string, valor: string) => Object.keys(consulta.filtros).length === 1 && consulta.filtros[chave]?.join() === valor;
  const atalhos: Atalho[] = [
    { rotulo: "Todas", href: com({}), ativo: Object.keys(consulta.filtros).length === 0 },
    { rotulo: "Com login único", href: com({ login: ["sim"] }), ativo: so("login", "sim") },
    { rotulo: "No ar", href: com({ situacao: ["no_ar"] }), ativo: so("situacao", "no_ar") },
    { rotulo: "Fora do ar", href: com({ situacao: ["fora_do_ar"] }), ativo: so("situacao", "fora_do_ar") },
    { rotulo: "Sites", href: com({ tipo: ["site"] }), ativo: so("tipo", "site") },
  ];

  const grupos = !consulta.grupo ? null
    : consulta.grupo === "situacao" ? agrupar(encontradas, (a) => ({ chave: a.situacao, rotulo: SITUACAO[a.situacao].texto }), SITUACOES)
    : consulta.grupo === "tipo" ? agrupar(encontradas, (a) => ({ chave: a.tipo, rotulo: a.tipo === "site" ? "Sites" : "Aplicações" }), ["app", "site"])
    : agrupar(encontradas, (a) => (a.empresaId ? { chave: a.empresaId, rotulo: a.empresaNome ?? "Empresa não encontrada" } : { chave: "", rotulo: ROTULO_SEM_EMPRESA }));

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Aplicações</h1>
          <Resumo
            encontrados={encontradas.length}
            total={todas.length}
            um="cadastrada"
            varios="cadastradas"
            complemento={`${todas.filter((a) => a.login).length} com login único · ${todas.filter((a) => a.situacao === "no_ar").length} informadas como no ar`}
          />
        </div>
        <Link href="/admin/apps/novo" className={`${botao} shrink-0 whitespace-nowrap`}>+ Nova aplicação</Link>
      </div>

      <BarraLista
        secao="apps"
        usuario={sessao.email}
        def={def}
        consulta={consulta}
        placeholder="Buscar por nome, domínio ou empresa"
        atalhos={atalhos}
        colunas={[
          { id: "empresa", rotulo: "Empresa" },
          { id: "situacao", rotulo: "Situação" },
          { id: "login", rotulo: "Login único" },
          { id: "acesso", rotulo: "Quem pode entrar" },
        ]}
      />

      <div id="lista-apps">
        {encontradas.length === 0 ? (
          <Vazio filtrado={filtrado} base={BASE} semCadastro="Nenhuma aplicação cadastrada ainda." acao={<Link href="/admin/apps/novo" className={botao}>Cadastrar a primeira</Link>} />
        ) : grupos ? (
          <>
            <ExpandirGrupos alvo="lista-apps" />
            {grupos.map((g) => (
              <SecaoGrupo key={g.chave || "sem"} rotulo={g.rotulo} quantidade={g.itens.length} um="aplicação" varios="aplicações">
                <Apps apps={g.itens} consulta={consulta} def={def} semMoldura />
              </SecaoGrupo>
            ))}
          </>
        ) : (
          (() => {
            const pagina = paginar(encontradas, consulta.pag, consulta.por);
            return (
              <>
                <Apps apps={pagina.itens} consulta={consulta} def={def} />
                <Paginacao pagina={pagina} base={BASE} consulta={consulta} def={def} rotulo="aplicações" />
              </>
            );
          })()
        )}
      </div>

      <p className="mt-4 text-xs text-[var(--color-texto-fraco)]">
        A situação é a informada no cadastro por alguém da equipe; o painel não monitora se o endereço responde. Só recebe sessão o que tem login único habilitado.
      </p>
    </div>
  );
}

function Acoes({ app }: { app: App }) {
  return (
    <MenuAcoes rotulo={app.nome}>
      <Link role="menuitem" href={`/admin/apps/${app.id}`} className={itemDeMenu}>Abrir a ficha</Link>
      <a role="menuitem" href={`https://${app.host}`} target="_blank" rel="noreferrer" className={itemDeMenu}>Abrir o site em nova aba</a>
      {app.login
        ? <a role="menuitem" href={urlLogin(app)} target="_blank" rel="noreferrer" className={itemDeMenu}>Entrar com login único</a>
        : <ItemIndisponivel motivo={app.tipo === "site" ? "Site não recebe sessão." : app.situacao === "desativado" ? "Aplicação desativada." : "Login único desabilitado no cadastro."}>Entrar com login único</ItemIndisponivel>}
      <Link role="menuitem" href={`/admin/eventos?f_app=${encodeURIComponent(app.id)}`} className={itemDeMenu}>Ver a atividade desta aplicação</Link>
    </MenuAcoes>
  );
}

function Apps({ apps, consulta, def, semMoldura }: { apps: App[]; consulta: Consulta; def: DefLista; semMoldura?: boolean }) {
  const th = { base: BASE, consulta, def };
  return (
    <>
      <ul className={`divide-y divide-[var(--color-borda)] md:hidden ${semMoldura ? "" : moldura}`}>
        {apps.map((app) => (
          <li key={app.id} className="flex items-stretch gap-1 bg-[var(--color-fundo)]">
            <Link href={`/admin/apps/${app.id}`} className="min-w-0 flex-1 px-3 py-2.5 active:bg-[var(--color-cartao)]">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-medium">{app.nome}</span>
                <Estado tom={SITUACAO[app.situacao].tom}>{SITUACAO[app.situacao].texto}</Estado>
              </div>
              <div className={secundario}>{app.host}</div>
              <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-[var(--color-texto-fraco)]">
                <span className="min-w-0 truncate">{app.empresaNome ?? "Sem empresa"}</span>
                <span>· {app.login ? `Login único: ${ACESSO[app.acesso].toLowerCase()}` : "Sem login único"}</span>
              </div>
            </Link>
            <div className="flex items-center pr-1"><Acoes app={app} /></div>
          </li>
        ))}
      </ul>

      <div className={`hidden md:block ${semMoldura ? "" : moldura}`}>
        <table className="w-full text-sm">
          <caption className="sr-only">Aplicações e sites cadastrados</caption>
          <thead className="bg-[var(--color-cartao)]">
            <tr>
              <Th {...th} campo="nome">Aplicação</Th>
              <Th {...th} campo="empresa" col="empresa">Empresa</Th>
              <Th {...th} campo="situacao" col="situacao" className="w-40">Situação informada</Th>
              <Th {...th} col="login" className="w-28">Login único</Th>
              <Th {...th} col="acesso" className="hidden w-56 xl:table-cell">Quem pode entrar</Th>
              <th scope="col" className="w-12 px-1"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr key={app.id} className={linha}>
                <td className={`${celula} max-w-0`}>
                  <Link href={`/admin/apps/${app.id}`} className="block truncate font-medium hover:text-[var(--color-marca)]">{app.nome}</Link>
                  <div data-secundario className={secundario}>
                    {app.host}
                    {app.tipo === "site" ? " · site" : ""}
                    {app.deepLink ? " · app nativo" : ""}
                  </div>
                </td>
                <td data-col="empresa" className={`${celula} max-w-0`}>
                  {app.empresaId
                    ? <Link href={`${BASE}?f_empresa=${encodeURIComponent(app.empresaId)}`} className="block truncate hover:text-[var(--color-marca)]">{app.empresaNome ?? "Empresa não encontrada"}</Link>
                    : <span className="block truncate text-xs text-[var(--color-texto-apagado)]">Sem empresa vinculada</span>}
                </td>
                <td data-col="situacao" className={celula}><Estado tom={SITUACAO[app.situacao].tom}>{SITUACAO[app.situacao].texto}</Estado></td>
                <td data-col="login" className={`${celula} text-xs`}>{app.login ? "Habilitado" : <span className="text-[var(--color-texto-fraco)]">Desabilitado</span>}</td>
                <td data-col="acesso" className={`${celula} hidden text-xs xl:table-cell`}>
                  {app.login ? ACESSO[app.acesso] : <span className="text-[var(--color-texto-apagado)]">—</span>}
                  {app.acesso === "liberados" && (
                    <span data-secundario className="block text-[var(--color-texto-fraco)]" title={app.liberados.join(", ")}>
                      {app.liberados.length === 0 ? "nenhum cliente liberado" : plural(app.liberados.length, "cliente liberado", "clientes liberados")}
                    </span>
                  )}
                </td>
                <td className="px-1 text-right"><Acoes app={app} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
