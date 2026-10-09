import Link from "next/link";
import IconeProvedor from "@/components/IconeProvedor";
import { exigirAdmin } from "@/lib/admin";
import { listarConectores, vinculosPorProvedor, type ConectorEstado } from "@/lib/conectores";
import { chaveConfigurada } from "@/lib/cripto";
import { agrupar, consultarEmMemoria, dataHora, filtrosAtivos, lerConsulta, plural, type Consulta, type DefLista } from "@/lib/listagem";
import { acaoLigarConector } from "./actions";
import FormAcao from "../_componentes/FormAcao";
import BarraLista from "../_componentes/lista/BarraLista";
import { ExpandirGrupos, itemDeMenu, MenuAcoes } from "../_componentes/lista/Interativos";
import { celula, Estado, linha, moldura, Resumo, SecaoGrupo, secundario, Th, Vazio } from "../_componentes/lista/Partes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conectores" };

const BASE = "/admin/conectores";
type Params = Record<string, string | string[] | undefined>;
type Situacao = "ligado" | "desligado" | "pendente";
type Linha = ConectorEstado & { situacao: Situacao; vinculadas: number };

const SITUACAO: Record<Situacao, { texto: string; tom: "bom" | "atencao" | "neutro"; proximo: string }> = {
  ligado: { texto: "Ligado", tom: "bom", proximo: "Nenhuma ação necessária" },
  desligado: { texto: "Configurado, desligado", tom: "atencao", proximo: "Ligar para aparecer no login" },
  pendente: { texto: "Configuração pendente", tom: "neutro", proximo: "Informar as credenciais" },
};
const ORDEM: readonly Situacao[] = ["ligado", "desligado", "pendente"];

const DEF: DefLista = {
  filtros: [{ chave: "situacao", rotulo: "Situação", tipo: "multi", opcoes: ORDEM.map((s) => ({ valor: s, rotulo: SITUACAO[s].texto })) }],
  ordens: [
    { campo: "nome", rotulo: "Nome" },
    { campo: "situacao", rotulo: "Situação", rotulos: ["ligados primeiro", "pendentes primeiro"] },
    { campo: "vinculadas", rotulo: "Contas vinculadas", padrao: "desc", rotulos: ["menos contas", "mais contas"] },
    { campo: "atualizado", rotulo: "Última alteração", padrao: "desc", rotulos: ["mais antiga", "mais recente"] },
  ],
  grupos: [{ valor: "situacao", rotulo: "Situação" }],
  ordemInicial: { campo: "nome", dir: "asc" },
};

/**
 * Conectores de login (Google, Microsoft, Apple…). São da plataforma inteira:
 * não pertencem a uma empresa nem a uma aplicação, e por isso esta listagem
 * não tem esses filtros. O conector não registra tentativa nem erro de uso; o
 * que existe é ligado, configurado ou pendente, e a data da última alteração.
 */
export default async function ConectoresPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const [sessao, conectores, contagem] = await Promise.all([exigirAdmin(BASE), listarConectores(), vinculosPorProvedor()]);
  const todas: Linha[] = conectores.map((c) => ({ ...c, situacao: c.ligado ? "ligado" : c.configurado ? "desligado" : "pendente", vinculadas: contagem[c.provedor.id] ?? 0 }));
  const consulta = lerConsulta(params, DEF);
  const encontradas = consultarEmMemoria(todas, consulta, {
    id: (c) => c.provedor.id,
    busca: (c) => [c.provedor.nome, c.provedor.descricao, c.provedor.id],
    filtro: (c, chave) => (chave === "situacao" ? [c.situacao] : []),
    ordem: (c, campo) => (campo === "situacao" ? ORDEM.indexOf(c.situacao) : campo === "vinculadas" ? c.vinculadas : campo === "atualizado" ? c.atualizadoEm : c.provedor.nome),
  });
  const ligados = todas.filter((c) => c.ligado).length;
  const podeSalvar = chaveConfigurada();

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Conectores</h1>
        <Resumo encontrados={encontradas.length} total={todas.length} um="conector" varios="conectores" complemento={`${ligados} ligado${ligados === 1 ? "" : "s"} · aparecem na tela de login assim que são ligados`} />
      </div>

      {!podeSalvar && (
        <div role="alert" className="mb-4 rounded-lg border border-[var(--color-marca-amarelo)]/40 bg-[var(--marca-amarelo-suave)] p-3 text-xs text-[var(--color-marca-amarelo)]">
          <strong>AUTH_ENCRYPTION_KEY</strong> não está configurada no servidor. Dá para ver esta tela, mas não para salvar credenciais.
          Gere com <code>openssl rand -hex 32</code> e coloque no <code>.env</code> do container.
        </div>
      )}

      <BarraLista secao="conectores" usuario={sessao.email} def={DEF} consulta={consulta} placeholder="Buscar conector" colunas={[{ id: "vinculadas", rotulo: "Contas vinculadas" }, { id: "atualizado", rotulo: "Última alteração" }, { id: "proximo", rotulo: "Próxima ação" }]} />

      <div id="lista-conectores">
        {encontradas.length === 0 ? (
          <Vazio filtrado={Boolean(consulta.q) || filtrosAtivos(consulta) > 0} base={BASE} semCadastro="Nenhum conector disponível." />
        ) : consulta.grupo ? (
          <>
            <ExpandirGrupos alvo="lista-conectores" />
            {agrupar(encontradas, (c) => ({ chave: c.situacao, rotulo: SITUACAO[c.situacao].texto }), ORDEM).map((g) => (
              <SecaoGrupo key={g.chave} rotulo={g.rotulo} quantidade={g.itens.length} um="conector" varios="conectores">
                <Conectores linhas={g.itens} consulta={consulta} semMoldura />
              </SecaoGrupo>
            ))}
          </>
        ) : (
          <Conectores linhas={encontradas} consulta={consulta} />
        )}
      </div>

      <p className="mt-4 text-xs text-[var(--color-texto-fraco)]">
        Login social nunca concede acesso de equipe. Conta da equipe só ganha um conector quando a própria pessoa, logada com senha, vincula em <code>/conta</code>.
        Cliente novo entra como cliente; e-mail sem verificação do provedor não se funde com conta existente.
      </p>
    </div>
  );
}

function Acoes({ c }: { c: Linha }) {
  return (
    <div className="flex items-center justify-end gap-1">
      {c.configurado && (
        <FormAcao acao={acaoLigarConector} className="contents">
          <input type="hidden" name="id" value={c.provedor.id} />
          <input type="hidden" name="ligado" value={c.ligado ? "0" : "1"} />
          <button type="submit" className="min-h-11 whitespace-nowrap rounded-lg border border-[var(--color-borda)] px-3 text-xs hover:bg-[var(--color-fundo)] lg:min-h-9">
            {c.ligado ? "Desligar" : "Ligar"}
          </button>
        </FormAcao>
      )}
      <MenuAcoes rotulo={c.provedor.nome}>
        <Link role="menuitem" href={`/admin/conectores/${c.provedor.id}`} className={itemDeMenu}>{c.configurado ? "Editar credenciais" : "Configurar"}</Link>
        <Link role="menuitem" href={`/admin/eventos?f_tipo=conector_alterado&q=${encodeURIComponent(c.provedor.id)}`} className={itemDeMenu}>Ver alterações na auditoria</Link>
      </MenuAcoes>
    </div>
  );
}

function Conectores({ linhas, consulta, semMoldura }: { linhas: Linha[]; consulta: Consulta; semMoldura?: boolean }) {
  const th = { base: BASE, consulta, def: DEF };
  return (
    <>
      <ul className={`divide-y divide-[var(--color-borda)] md:hidden ${semMoldura ? "" : moldura}`}>
        {linhas.map((c) => (
          <li key={c.provedor.id} className="flex items-center gap-3 bg-[var(--color-fundo)] px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-borda)]"><IconeProvedor id={c.provedor.id} tamanho={c.provedor.id === "govbr" ? 12 : 18} /></span>
            <Link href={`/admin/conectores/${c.provedor.id}`} className="min-w-0 flex-1">
              <div className="truncate font-medium">{c.provedor.nome}</div>
              <Estado tom={SITUACAO[c.situacao].tom}>{SITUACAO[c.situacao].texto}</Estado>
              <div className={secundario}>{plural(c.vinculadas, "conta vinculada", "contas vinculadas")}</div>
            </Link>
            <Acoes c={c} />
          </li>
        ))}
      </ul>

      <div className={`hidden md:block ${semMoldura ? "" : moldura}`}>
        <table className="w-full text-sm">
          <caption className="sr-only">Conectores de login</caption>
          <thead className="bg-[var(--color-cartao)]">
            <tr>
              <Th {...th} campo="nome">Conector</Th>
              <Th {...th} campo="situacao" className="w-48">Situação</Th>
              <Th {...th} campo="vinculadas" col="vinculadas" className="w-36">Contas vinculadas</Th>
              <Th {...th} campo="atualizado" col="atualizado" className="hidden w-44 xl:table-cell">Última alteração</Th>
              <Th {...th} col="proximo" className="hidden w-56 2xl:table-cell">Próxima ação</Th>
              <th scope="col" className="w-32 px-1"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((c) => (
              <tr key={c.provedor.id} className={linha}>
                <td className={`${celula} max-w-0`}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-borda)]"><IconeProvedor id={c.provedor.id} tamanho={c.provedor.id === "govbr" ? 11 : 16} /></span>
                    <div className="min-w-0">
                      <Link href={`/admin/conectores/${c.provedor.id}`} className="block truncate font-medium hover:text-[var(--color-marca)]">{c.provedor.nome}</Link>
                      <div data-secundario className={secundario}>{c.provedor.descricao}</div>
                    </div>
                  </div>
                </td>
                <td className={celula}><Estado tom={SITUACAO[c.situacao].tom}>{SITUACAO[c.situacao].texto}</Estado></td>
                <td data-col="vinculadas" className={`${celula} text-xs tabular-nums`}>{c.vinculadas.toLocaleString("pt-BR")}</td>
                <td data-col="atualizado" className={`${celula} hidden text-xs text-[var(--color-texto-fraco)] xl:table-cell`}>
                  <span className="tabular-nums">{dataHora(c.atualizadoEm, "Nunca alterado")}</span>
                  {c.atualizadoPor && <span data-secundario className="block truncate">por {c.atualizadoPor}</span>}
                </td>
                <td data-col="proximo" className={`${celula} hidden text-xs text-[var(--color-texto-fraco)] 2xl:table-cell`}>{SITUACAO[c.situacao].proximo}</td>
                <td className="px-1"><Acoes c={c} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
