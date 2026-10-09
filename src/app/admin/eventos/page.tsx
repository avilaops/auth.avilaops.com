import Link from "next/link";
import { exigirAdmin } from "@/lib/admin";
import { listarCadastro } from "@/lib/cadastro";
import { listarEmpresas, SEM_EMPRESA } from "@/lib/empresas";
import { consultarEventos, facetasDosEventos } from "@/lib/eventos";
import { autorEAlvo, descreverEvento, ROTULO_RESULTADO, tiposDoResultado, type Resultado } from "@/lib/eventosCatalogo";
import { data, filtrosAtivos, FUSO, hora, intervaloDoPeriodo, lerConsulta, paraParams, type Consulta, type DefLista } from "@/lib/listagem";
import BarraLista, { type Atalho } from "../_componentes/lista/BarraLista";
import { Paginacao, Resumo, Vazio } from "../_componentes/lista/Partes";
import ListaEventos, { type EventoLinha } from "./ListaEventos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atividade" };

const BASE = "/admin/eventos";
type Params = Record<string, string | string[] | undefined>;

function atalhos(consulta: Consulta, def: DefLista): Atalho[] {
  const com = (mudanca: Partial<Consulta>) => {
    const p = paraParams({ ...consulta, pag: 1, ...mudanca }, def);
    return p.size > 0 ? `${BASE}?${p.toString()}` : BASE;
  };
  const semPeriodo = !consulta.periodo && !consulta.de && !consulta.ate;
  return [
    { rotulo: "Todo o período", href: com({ periodo: "", de: "", ate: "" }), ativo: semPeriodo },
    { rotulo: "Hoje", href: com({ periodo: "hoje", de: "", ate: "" }), ativo: consulta.periodo === "hoje" },
    { rotulo: "Últimos 7 dias", href: com({ periodo: "7d", de: "", ate: "" }), ativo: consulta.periodo === "7d" },
    { rotulo: "Últimos 30 dias", href: com({ periodo: "30d", de: "", ate: "" }), ativo: consulta.periodo === "30d" },
    { rotulo: "Só falhas", href: com({ filtros: { resultado: ["falha"] } }), ativo: Object.keys(consulta.filtros).length === 1 && consulta.filtros.resultado?.join() === "falha" },
  ];
}

export default async function EventosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const [sessao, facetas, cadastro, empresas] = await Promise.all([exigirAdmin(BASE), facetasDosEventos(), listarCadastro(), listarEmpresas()]);
  const nomeApp = new Map(cadastro.map((a) => [a.id, a.nome]));
  const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));

  const def: DefLista = {
    periodo: true,
    filtros: [
      { chave: "resultado", rotulo: "Resultado", tipo: "multi", opcoes: (Object.keys(ROTULO_RESULTADO) as Resultado[]).map((r) => ({ valor: r, rotulo: ROTULO_RESULTADO[r] })) },
      {
        chave: "tipo",
        rotulo: "Tipo de evento",
        tipo: "multi",
        opcoes: facetas.tipos.map((t) => ({ valor: t, rotulo: descreverEvento(t).rotulo })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR")),
      },
      {
        chave: "app",
        rotulo: "Aplicação",
        tipo: "multi",
        opcoes: facetas.apps.map((id) => ({ valor: id, rotulo: nomeApp.get(id) ?? id })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR")),
      },
      {
        chave: "empresa",
        rotulo: "Empresa registrada",
        tipo: "multi",
        opcoes: [
          ...facetas.empresas.map((id) => ({ valor: id, rotulo: nomeEmpresa.get(id) ?? "Empresa não encontrada" })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR")),
          { valor: SEM_EMPRESA, rotulo: "Sem empresa registrada" },
        ],
      },
    ],
    ordens: [{ campo: "data", rotulo: "Data", padrao: "desc", rotulos: ["mais antigos primeiro", "mais recentes primeiro"] }],
    grupos: [],
    ordemInicial: { campo: "data", dir: "desc" },
  };
  const consulta = lerConsulta(params, def);

  // Resultado e tipo são o mesmo eixo visto de dois jeitos: quando os dois
  // estão marcados, vale a interseção (E entre filtros diferentes).
  const doResultado = consulta.filtros.resultado ? tiposDoResultado(consulta.filtros.resultado) : null;
  const doTipo = consulta.filtros.tipo ?? null;
  const tipos = doResultado && doTipo ? doTipo.filter((t) => doResultado.includes(t)) : (doResultado ?? doTipo);
  const semIntersecao = tipos !== null && tipos.length === 0;

  // A referência congela o conjunto: evento que chega depois não empurra
  // linhas entre as páginas. "Atualizar" abre a listagem com uma nova.
  const refPedida = typeof params.ref === "string" ? new Date(params.ref) : null;
  const referencia = refPedida && !Number.isNaN(refPedida.getTime()) ? refPedida : new Date();
  const extra = `ref=${referencia.toISOString()}`;

  const pagina = semIntersecao
    ? { itens: [], total: 0, pag: 1, paginas: 1, de: 0, ate: 0 }
    : await consultarEventos(
        { busca: consulta.q, tipos: tipos ?? undefined, apps: consulta.filtros.app, empresas: consulta.filtros.empresa, ...intervaloDoPeriodo(consulta), referencia },
        { pag: consulta.pag, por: consulta.por, dir: consulta.dir },
      );

  const linhas: EventoLinha[] = pagina.itens.map((e) => {
    const d = descreverEvento(e.tipo);
    const quem = autorEAlvo(e);
    return {
      id: e.id,
      tipo: e.tipo,
      rotulo: d.rotulo,
      resultado: d.resultado,
      rotuloResultado: ROTULO_RESULTADO[d.resultado],
      data: data(e.criadoEm),
      hora: hora(e.criadoEm),
      iso: e.criadoEm.toISOString(),
      autor: quem.autor,
      alvo: quem.alvo,
      proprio: quem.proprio,
      appId: e.appId,
      appNome: e.appId ? (nomeApp.get(e.appId) ?? null) : null,
      empresa: e.organizacaoId ? (nomeEmpresa.get(e.organizacaoId) ?? "Empresa não encontrada") : null,
      ip: e.ip,
      detalhe: e.detalhe,
    };
  });
  const filtrado = Boolean(consulta.q) || filtrosAtivos(consulta) > 0;
  const atual = paraParams({ ...consulta, pag: 1 }, def);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Atividade</h1>
          <Resumo encontrados={pagina.total} total={filtrado ? facetas.total : pagina.total} um="evento" varios="eventos" complemento="horários de Brasília (America/Sao_Paulo)" />
        </div>
        <Link href={atual.size > 0 ? `${BASE}?${atual.toString()}` : BASE} className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-[var(--color-borda)] px-4 text-sm hover:bg-[var(--color-cartao)]">
          Atualizar
        </Link>
      </div>

      <BarraLista
        secao="eventos"
        usuario={sessao.email}
        def={def}
        consulta={consulta}
        placeholder="Buscar por e-mail, autor, detalhe ou IP"
        atalhos={atalhos(consulta, def)}
        colunas={[
          { id: "alvo", rotulo: "Alvo" },
          { id: "app", rotulo: "Aplicação" },
          { id: "empresa", rotulo: "Empresa" },
          { id: "resultado", rotulo: "Resultado" },
        ]}
      />

      <div id="lista-eventos">
        {linhas.length === 0 ? (
          <Vazio filtrado={filtrado} base={BASE} semCadastro="Nada registrado na auditoria ainda." />
        ) : (
          <>
            <ListaEventos eventos={linhas} fuso={FUSO} />
            <Paginacao pagina={pagina} base={BASE} consulta={consulta} def={def} extra={extra} rotulo="eventos" />
          </>
        )}
      </div>

      <p className="mt-4 text-xs text-[var(--color-texto-fraco)]">
        A empresa de cada evento é a que a conta tinha no instante em que ele aconteceu, gravada junto com o evento desde 09/10/2026. Eventos anteriores não têm
        empresa registrada, e o painel não a deduz pelo vínculo de hoje.
      </p>
    </div>
  );
}
