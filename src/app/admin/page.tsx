import Link from "next/link";
import { exigirAdmin } from "@/lib/admin";
import { ehDaCasa, listarTodasAsContas } from "@/lib/contas";
import { agruparContas, consultarContas, defContas, montarContas, ROTULO_PAPEL, type ContaListada } from "@/lib/contasLista";
import { listarEmpresas } from "@/lib/empresas";
import { ultimosLogins } from "@/lib/eventos";
import { dataHora, filtrosAtivos, lerConsulta, paginar, paraParams, type Consulta, type DefLista } from "@/lib/listagem";
import { lerBusca } from "@/lib/buscaSigilosa";
import { ativosPorEmail, diagnosticar } from "@/lib/segundoFator";
import { acaoEsquecerBusca, acaoGuardarBusca } from "./actions";
import { botao } from "./_componentes/estilos";
import BarraLista, { type Atalho } from "./_componentes/lista/BarraLista";
import { ExpandirGrupos, itemDeMenu, MenuAcoes } from "./_componentes/lista/Interativos";
import { celula, Estado, linha, moldura, Paginacao, Resumo, SecaoGrupo, secundario, Th, Vazio } from "./_componentes/lista/Partes";
import Papel from "./_componentes/Papel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contas" };

const BASE = "/admin";

function decodificar(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return "";
  }
}

type Params = Record<string, string | string[] | undefined>;

function atalhos(consulta: Consulta, def: DefLista): Atalho[] {
  const feito = (filtros: Record<string, string[]>): Atalho["href"] => {
    const p = paraParams({ ...consulta, q: "", filtros, pag: 1 }, def);
    return p.size > 0 ? `${BASE}?${p.toString()}` : BASE;
  };
  const so = (chave: string, valor: string) => Object.keys(consulta.filtros).length === 1 && consulta.filtros[chave]?.join() === valor;
  return [
    { rotulo: "Todas", href: feito({}), ativo: Object.keys(consulta.filtros).length === 0 },
    { rotulo: "Equipe", href: feito({ tipo: ["equipe"] }), ativo: so("tipo", "equipe") },
    { rotulo: "Clientes", href: feito({ tipo: ["cliente"] }), ativo: so("tipo", "cliente") },
    { rotulo: "Senha provisória", href: feito({ senha: ["provisoria"] }), ativo: so("senha", "provisoria") },
    { rotulo: "Nunca acessaram", href: feito({ acesso: ["nunca"] }), ativo: so("acesso", "nunca") },
    { rotulo: "Desligadas", href: feito({ estado: ["desligada"] }), ativo: so("estado", "desligada") },
  ];
}

export default async function ContasPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const [sessao, { contas: brutas, truncado }, empresas, logins, comFator, saude] = await Promise.all([
    exigirAdmin(),
    listarTodasAsContas(),
    listarEmpresas(),
    ultimosLogins(),
    ativosPorEmail(),
    diagnosticar(),
  ]);

  const todas = montarContas(brutas, empresas, logins, comFator);
  const def = defContas(empresas, todas);
  const consulta = lerConsulta(params, def);
  // CPF digitado na busca fica guardado no servidor; a URL só leva o
  // identificador (`qs`), que vale para esta conta e por tempo limitado.
  const idDaBusca = typeof params.qs === "string" ? params.qs : "";
  const sigilosa = idDaBusca ? ((await lerBusca(idDaBusca, sessao.email, "contas")) ?? "") : "";
  const buscaVencida = Boolean(idDaBusca) && !sigilosa;
  const busca = sigilosa || consulta.q;
  const extra = sigilosa ? `qs=${idDaBusca}` : undefined;

  const encontradas = consultarContas(todas, consulta, busca);
  const filtrado = Boolean(busca) || filtrosAtivos(consulta) > 0;
  const equipe = todas.filter((c) => ehDaCasa(c.role)).length;
  const comEmpresa = todas.filter((c) => c.organizationId).length;

  return (
    <div className="mx-auto max-w-7xl">
      {/*
        A suspensão do segundo fator é silenciosa por desenho — o login segue
        funcionando, que é o certo. O que não pode é ninguém ficar sabendo:
        aqui é a primeira tela que a equipe abre, e é onde a falta aparece.
      */}
      {!saude.disponivel && (
        <div role="alert" className="mb-5 rounded-xl border border-[var(--color-marca-vermelho)]/40 bg-[var(--marca-vermelho-suave)] p-4 text-sm">
          <strong className="text-[var(--color-marca-vermelho)]">Verificação em duas etapas suspensa.</strong>{" "}
          <span className="text-[var(--color-texto-fraco)]">
            {saude.migracoes === "pendentes"
              ? "As tabelas do segundo fator não existem neste banco — rode `npx prisma migrate deploy`."
              : "Falta AUTH_ENCRYPTION_KEY no servidor."}{" "}
            Enquanto isso, todas as contas entram só com a senha.
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Contas</h1>
          <Resumo
            encontrados={encontradas.length}
            total={todas.length}
            um="conta"
            varios="contas"
            complemento={`${equipe} da equipe Avila Ops · ${todas.length - equipe} de clientes · ${comEmpresa} com empresa vinculada`}
          />
        </div>
        <Link href="/admin/contas/nova" className={`${botao} shrink-0 whitespace-nowrap`}>+ Nova conta</Link>
      </div>

      {truncado && (
        <p role="alert" className="mb-3 rounded-lg border border-[var(--color-marca-amarelo)]/40 bg-[var(--marca-amarelo-suave)] p-3 text-xs text-[var(--color-marca-amarelo)]">
          A base passou do limite desta listagem. Os totais abaixo consideram só as primeiras contas em ordem alfabética.
        </p>
      )}

      {buscaVencida && (
        <p role="status" className="mb-3 rounded-lg border border-[var(--color-borda)] p-3 text-xs text-[var(--color-texto-fraco)]">
          A busca por CPF deste endereço venceu ou não é desta sessão. Digite de novo para refazê-la.
        </p>
      )}

      <BarraLista
        secao="contas"
        usuario={sessao.email}
        def={def}
        consulta={consulta}
        placeholder="Buscar por nome, e-mail ou CPF"
        buscaInicial={sigilosa || undefined}
        guardarBusca={acaoGuardarBusca}
        esquecerBusca={acaoEsquecerBusca}
        atalhos={atalhos(consulta, def)}
        colunas={[
          { id: "empresa", rotulo: "Empresa" },
          { id: "papel", rotulo: "Perfil" },
          { id: "estado", rotulo: "Estado" },
          { id: "senha", rotulo: "Senha e 2FA" },
          { id: "acesso", rotulo: "Último acesso" },
          { id: "criada", rotulo: "Criada em" },
        ]}
        ocultasDePadrao={["criada"]}
      />

      <div id="lista-contas">
        {encontradas.length === 0 ? (
          <Vazio
            filtrado={filtrado}
            base={BASE}
            semCadastro="Nenhuma conta cadastrada ainda."
            acao={<Link href="/admin/contas/nova" className={botao}>Criar a primeira conta</Link>}
          />
        ) : consulta.grupo ? (
          <>
            <ExpandirGrupos alvo="lista-contas" />
            {agruparContas(encontradas, consulta.grupo).map((g) => (
              <SecaoGrupo key={g.chave || "sem"} rotulo={g.rotulo} quantidade={g.itens.length} um="conta" varios="contas">
                <Contas contas={g.itens} consulta={consulta} def={def} extra={extra} semMoldura grupo={consulta.grupo} />
              </SecaoGrupo>
            ))}
            <p className="mt-2 text-xs text-[var(--color-texto-fraco)]">
              Cada conta pertence a uma empresa só, então a soma dos grupos é o total de contas encontradas.
            </p>
          </>
        ) : (
          (() => {
            const pagina = paginar(encontradas, consulta.pag, consulta.por);
            return (
              <>
                <Contas contas={pagina.itens} consulta={consulta} def={def} extra={extra} />
                <Paginacao pagina={pagina} base={BASE} consulta={consulta} def={def} extra={extra} rotulo="contas" />
              </>
            );
          })()
        )}
      </div>
    </div>
  );
}

function Situacao({ c }: { c: ContaListada }) {
  return c.ativa ? <Estado tom="bom">Ativa</Estado> : <Estado tom="neutro">Desligada</Estado>;
}

function Senha({ c }: { c: ContaListada }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {c.senhaProvisoria ? <Estado tom="atencao">Senha provisória</Estado> : <span className="text-xs text-[var(--color-texto-fraco)]">Senha definida</span>}
      {c.segundoFator && <span className="text-xs text-[var(--color-texto-fraco)]">· 2FA</span>}
    </span>
  );
}

function Acoes({ c }: { c: ContaListada }) {
  return (
    <MenuAcoes rotulo={c.nome}>
      <Link role="menuitem" href={`/admin/contas/${c.id}`} className={itemDeMenu}>Abrir a ficha</Link>
      <Link role="menuitem" href={`/admin/eventos?q=${encodeURIComponent(c.email)}`} className={itemDeMenu}>Ver a atividade desta conta</Link>
      {c.organizationId && (
        <Link role="menuitem" href={`${BASE}?f_empresa=${encodeURIComponent(c.organizationId)}`} className={itemDeMenu}>Ver contas da mesma empresa</Link>
      )}
    </MenuAcoes>
  );
}

function Contas({ contas, consulta, def, extra, semMoldura, grupo }: { contas: ContaListada[]; consulta: Consulta; def: DefLista; extra?: string; semMoldura?: boolean; grupo?: string }) {
  const th = { base: BASE, consulta, def, extra };
  return (
    <>
      {/* Celular: lista compacta. O essencial em três linhas; o resto está na ficha. */}
      <ul className={`divide-y divide-[var(--color-borda)] md:hidden ${semMoldura ? "" : moldura}`}>
        {contas.map((c) => (
          <li key={c.id} className="flex items-stretch gap-1 bg-[var(--color-fundo)]">
            <Link href={`/admin/contas/${c.id}`} className="min-w-0 flex-1 px-3 py-2.5 active:bg-[var(--color-cartao)]">
              <div className="flex items-center gap-2">
                <span className="min-w-0 truncate font-medium">{c.nome}</span>
                {!c.ativa && <Estado tom="neutro">Desligada</Estado>}
              </div>
              <div className={secundario}>{c.email}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--color-texto-fraco)]">
                {grupo !== "empresa" && <span className="min-w-0 truncate">{c.empresaNome ?? (c.organizationId ? "Empresa não encontrada" : "Sem empresa")}</span>}
                {grupo !== "papel" && <span>· {ROTULO_PAPEL[c.role]}</span>}
                {c.senhaProvisoria && <Estado tom="atencao">Senha provisória</Estado>}
              </div>
              <div className="mt-0.5 text-xs text-[var(--color-texto-fraco)]">Último acesso: {dataHora(c.ultimoAcesso, "nunca")}</div>
            </Link>
            <div className="flex items-center pr-1"><Acoes c={c} /></div>
          </li>
        ))}
      </ul>

      <div className={`hidden md:block ${semMoldura ? "" : moldura}`}>
        <table className="w-full text-sm">
          <caption className="sr-only">Contas, {contas.length} nesta página</caption>
          <thead className="bg-[var(--color-cartao)]">
            <tr>
              <Th {...th} campo="nome">Nome</Th>
              {grupo !== "empresa" && <Th {...th} campo="empresa" col="empresa">Empresa</Th>}
              <Th {...th} campo="papel" col="papel" className="w-36">Perfil</Th>
              <Th {...th} campo="estado" col="estado" className="hidden w-28 xl:table-cell">Estado</Th>
              <Th {...th} col="senha" className="hidden w-44 xl:table-cell">Senha</Th>
              <Th {...th} campo="acesso" col="acesso" className="w-36">Último acesso</Th>
              <Th {...th} campo="criada" col="criada" className="hidden w-40 xl:table-cell">Criada em</Th>
              <th scope="col" className="w-12 px-1"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {contas.map((c) => (
              <tr key={c.id} className={linha}>
                <td className={`${celula} max-w-0`}>
                  <Link href={`/admin/contas/${c.id}`} className="block truncate font-medium hover:text-[var(--color-marca)] focus-visible:outline-none focus-visible:underline">{c.nome}</Link>
                  <div data-secundario className={secundario}>{c.email}</div>
                  {(!c.ativa || c.senhaProvisoria) && (
                    <div className="mt-0.5 flex flex-wrap gap-x-2 xl:hidden">
                      {!c.ativa && <Estado tom="neutro">Desligada</Estado>}
                      {c.senhaProvisoria && <Estado tom="atencao">Senha provisória</Estado>}
                    </div>
                  )}
                </td>
                {grupo !== "empresa" && <td data-col="empresa" className={`${celula} max-w-0`}>
                  {c.organizationId
                    ? <Link href={`${BASE}?f_empresa=${encodeURIComponent(c.organizationId)}`} className="block truncate hover:text-[var(--color-marca)]" title="Ver só as contas desta empresa">{c.empresaNome ?? "Empresa não encontrada"}</Link>
                    : <span className="block truncate text-xs text-[var(--color-texto-apagado)]">Sem empresa vinculada</span>}
                </td>}
                <td data-col="papel" className={celula}><Papel role={c.role} /></td>
                <td data-col="estado" className={`${celula} hidden xl:table-cell`}><Situacao c={c} /></td>
                <td data-col="senha" className={`${celula} hidden xl:table-cell`}><Senha c={c} /></td>
                <td data-col="acesso" className={`${celula} whitespace-nowrap text-xs text-[var(--color-texto-fraco)] tabular-nums`}>{dataHora(c.ultimoAcesso, "Nunca acessou")}</td>
                <td data-col="criada" className={`${celula} hidden whitespace-nowrap text-xs text-[var(--color-texto-fraco)] tabular-nums xl:table-cell`}>{dataHora(c.criadoEm)}</td>
                <td className="px-1 text-right"><Acoes c={c} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
