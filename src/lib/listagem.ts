/**
 * Regras das listagens do painel: ler a consulta da URL, filtrar, ordenar,
 * agrupar e paginar.
 *
 * Tudo aqui é puro e roda no servidor, sobre o conjunto inteiro que a pessoa
 * pode ver, antes de cortar a página. As cinco seções usam as mesmas funções,
 * então "filtro combina com E, opções do mesmo filtro com OU" e "valor ausente
 * vai para o fim" valem igual em todas, no computador e no celular.
 */

export type Direcao = "asc" | "desc";

export type OpcaoFiltro = { valor: string; rotulo: string };

export type DefFiltro = {
  chave: string;
  rotulo: string;
  /** `multi`: várias opções (OU entre elas). `unico`: uma só. */
  tipo: "multi" | "unico";
  opcoes: OpcaoFiltro[];
};

export type DefOrdem = { campo: string; rotulo: string; padrao?: Direcao; rotulos?: [string, string] };
export type DefGrupo = { valor: string; rotulo: string };

export type DefLista = {
  filtros: DefFiltro[];
  ordens: DefOrdem[];
  grupos: DefGrupo[];
  ordemInicial: { campo: string; dir: Direcao };
  /** Aceita `de` e `ate` (AAAA-MM-DD) e o atalho `periodo`. */
  periodo?: boolean;
};

export type Consulta = {
  q: string;
  filtros: Record<string, string[]>;
  ord: string;
  dir: Direcao;
  grupo: string;
  pag: number;
  por: number;
  periodo: string;
  de: string;
  ate: string;
};

export const TAMANHOS_DE_PAGINA = [25, 50, 100] as const;
export const ATALHOS_DE_PERIODO = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "7d", rotulo: "Últimos 7 dias" },
  { valor: "30d", rotulo: "Últimos 30 dias" },
] as const;

type Params = Record<string, string | string[] | undefined>;

function um(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lê a consulta da URL e descarta o que não está na definição da seção.
 *
 * Campo de ordenação, filtro ou opção desconhecidos são ignorados em vez de
 * virarem erro: um link antigo continua abrindo, e nada que venha da URL chega
 * a uma consulta sem passar por esta lista.
 */
export function lerConsulta(params: Params, def: DefLista): Consulta {
  const filtros: Record<string, string[]> = {};
  for (const f of def.filtros) {
    const validos = new Set(f.opcoes.map((o) => o.valor));
    const pedidos = um(params[`f_${f.chave}`]).split(",").map((v) => v.trim()).filter((v) => validos.has(v));
    const unicos = [...new Set(pedidos)];
    if (unicos.length > 0) filtros[f.chave] = f.tipo === "unico" ? unicos.slice(0, 1) : unicos;
  }

  const ordPedida = um(params.ord);
  const ordem = def.ordens.find((o) => o.campo === ordPedida);
  const dirPedida = um(params.dir);
  const ord = ordem ? ordem.campo : def.ordemInicial.campo;
  const dir: Direcao = dirPedida === "asc" || dirPedida === "desc"
    ? dirPedida
    : ordem ? (ordem.padrao ?? "asc") : def.ordemInicial.dir;

  const grupoPedido = um(params.grupo);
  const grupo = def.grupos.some((g) => g.valor === grupoPedido) ? grupoPedido : "";

  const porPedido = Number(um(params.por));
  const por = (TAMANHOS_DE_PAGINA as readonly number[]).includes(porPedido) ? porPedido : TAMANHOS_DE_PAGINA[0];
  const pagPedida = Math.floor(Number(um(params.pag)));
  const pag = Number.isFinite(pagPedida) && pagPedida >= 1 ? Math.min(pagPedida, 100_000) : 1;

  let periodo = "";
  let de = "";
  let ate = "";
  if (def.periodo) {
    const atalho = um(params.periodo);
    if (ATALHOS_DE_PERIODO.some((a) => a.valor === atalho)) periodo = atalho;
    else {
      if (DIA.test(um(params.de))) de = um(params.de);
      if (DIA.test(um(params.ate))) ate = um(params.ate);
      if (de && ate && de > ate) [de, ate] = [ate, de];
    }
  }

  return { q: um(params.q).trim().slice(0, 120), filtros, ord, dir, grupo, pag, por, periodo, de, ate };
}

/** Quantos filtros estão aplicados (a busca não conta: ela tem campo próprio). */
export function filtrosAtivos(c: Consulta): number {
  return Object.keys(c.filtros).length + (c.periodo || c.de || c.ate ? 1 : 0);
}

/**
 * A consulta de volta em parâmetros de URL, só com o que difere do padrão.
 * Mudar busca, filtro, ordem ou agrupamento volta à primeira página: quem
 * chama passa `pag` só quando quer mesmo trocar de página.
 */
export function paraParams(c: Partial<Consulta> & Pick<Consulta, "filtros">, def: DefLista): URLSearchParams {
  const p = new URLSearchParams();
  if (c.q) p.set("q", c.q);
  for (const f of def.filtros) {
    const v = c.filtros[f.chave];
    if (v && v.length > 0) p.set(`f_${f.chave}`, v.join(","));
  }
  if (c.periodo) p.set("periodo", c.periodo);
  else {
    if (c.de) p.set("de", c.de);
    if (c.ate) p.set("ate", c.ate);
  }
  if (c.ord && (c.ord !== def.ordemInicial.campo || (c.dir && c.dir !== def.ordemInicial.dir))) {
    p.set("ord", c.ord);
    if (c.dir) p.set("dir", c.dir);
  }
  if (c.grupo) p.set("grupo", c.grupo);
  if (c.por && c.por !== TAMANHOS_DE_PAGINA[0]) p.set("por", String(c.por));
  if (c.pag && c.pag > 1) p.set("pag", String(c.pag));
  return p;
}

/** Minúsculas e sem acento: "João" casa com "joao". */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** A busca casa quando todos os termos aparecem em algum dos campos. */
export function casaBusca(q: string, campos: Array<string | null | undefined>): boolean {
  const termos = normalizar(q).split(/\s+/).filter(Boolean);
  if (termos.length === 0) return true;
  const alvo = campos.map(normalizar).join("\n");
  return termos.every((t) => alvo.includes(t));
}

/** Só dígitos, para buscar CPF digitado com ou sem pontuação. */
export function soDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * Busca que parece CPF não vai para a URL: endereço fica no histórico do
 * navegador, em log de servidor e em link copiado.
 */
export function pareceCpf(q: string): boolean {
  const limpo = q.trim();
  return /^[\d.\-/\s]+$/.test(limpo) && soDigitos(limpo).length >= 6;
}

/**
 * Filtros entre categorias combinam com E; opções da mesma categoria, com OU.
 * `valores` devolve as opções em que o item se encaixa naquele filtro.
 */
export function passaNosFiltros<T>(item: T, filtros: Record<string, string[]>, valores: (item: T, chave: string) => string[]): boolean {
  for (const [chave, pedidos] of Object.entries(filtros)) {
    if (pedidos.length === 0) continue;
    const doItem = valores(item, chave);
    if (!pedidos.some((p) => doItem.includes(p))) return false;
  }
  return true;
}

const colador = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

export type ValorOrdenavel = string | number | Date | null | undefined;

function vazio(v: ValorOrdenavel): boolean {
  return v === null || v === undefined || v === "";
}

/**
 * Ordena sem mudar a lista original.
 *
 * Texto segue o português (acento e maiúscula não mudam a ordem). Valor
 * ausente vai sempre para o fim, nas duas direções: "nunca acessou" não deve
 * aparecer na frente só porque a pessoa pediu "mais antigo primeiro". Empate
 * desfaz pelo identificador, para a mesma consulta devolver a mesma ordem em
 * todas as páginas.
 */
export function ordenar<T>(itens: readonly T[], valor: (item: T) => ValorOrdenavel, dir: Direcao, id: (item: T) => string): T[] {
  const sinal = dir === "asc" ? 1 : -1;
  return [...itens].sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    const vaziaA = vazio(va);
    const vaziaB = vazio(vb);
    if (vaziaA !== vaziaB) return vaziaA ? 1 : -1;
    let c = 0;
    if (!vaziaA && !vaziaB) {
      if (typeof va === "string" && typeof vb === "string") c = colador.compare(va, vb);
      else c = Number(va) - Number(vb);
    }
    if (c !== 0) return c * sinal;
    return id(a) < id(b) ? -1 : id(a) > id(b) ? 1 : 0;
  });
}

export type Pagina<T> = { itens: T[]; total: number; pag: number; paginas: number; de: number; ate: number };

/** Corta a página pedida; página além do fim vira a última. */
export function paginar<T>(itens: readonly T[], pag: number, por: number): Pagina<T> {
  const total = itens.length;
  const paginas = Math.max(1, Math.ceil(total / por));
  const atual = Math.min(Math.max(1, pag), paginas);
  const inicio = (atual - 1) * por;
  const fatia = itens.slice(inicio, inicio + por);
  return { itens: fatia, total, pag: atual, paginas, de: total === 0 ? 0 : inicio + 1, ate: inicio + fatia.length };
}

export type Grupo<T> = { chave: string; rotulo: string; itens: T[] };

/**
 * Agrupa o conjunto filtrado inteiro, já ordenado: dentro de cada grupo vale a
 * ordem que a pessoa escolheu. Os grupos saem em ordem alfabética e o grupo
 * sem chave (`""`, por exemplo "Sem empresa vinculada") vai por último.
 */
export function agrupar<T>(itens: readonly T[], grupoDe: (item: T) => { chave: string; rotulo: string }, ordemFixa?: readonly string[]): Grupo<T>[] {
  const mapa = new Map<string, Grupo<T>>();
  for (const item of itens) {
    const g = grupoDe(item);
    const atual = mapa.get(g.chave);
    if (atual) atual.itens.push(item);
    else mapa.set(g.chave, { chave: g.chave, rotulo: g.rotulo, itens: [item] });
  }
  return [...mapa.values()].sort((a, b) => {
    if ((a.chave === "") !== (b.chave === "")) return a.chave === "" ? 1 : -1;
    if (ordemFixa) {
      const ia = ordemFixa.indexOf(a.chave);
      const ib = ordemFixa.indexOf(b.chave);
      if (ia !== ib) return (ia < 0 ? ordemFixa.length : ia) - (ib < 0 ? ordemFixa.length : ib);
    }
    return colador.compare(a.rotulo, b.rotulo) || (a.chave < b.chave ? -1 : 1);
  });
}

export const FUSO = "America/Sao_Paulo";

/** Meia-noite de um dia de São Paulo, em UTC. O Brasil não tem horário de verão desde 2019. */
function inicioDoDia(dia: string): Date {
  return new Date(`${dia}T00:00:00-03:00`);
}

function diaEmSaoPaulo(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Intervalo `[desde, ate)` de um período, com os dias contados em São Paulo.
 * "Últimos 7 dias" inclui hoje.
 */
export function intervaloDoPeriodo(c: Pick<Consulta, "periodo" | "de" | "ate">, agora = new Date()): { desde?: Date; ate?: Date } {
  const hoje = diaEmSaoPaulo(agora);
  const maisDias = (dia: string, n: number) => new Date(inicioDoDia(dia).getTime() + n * 86_400_000);
  if (c.periodo === "hoje") return { desde: inicioDoDia(hoje), ate: maisDias(hoje, 1) };
  if (c.periodo === "7d") return { desde: maisDias(hoje, -6), ate: maisDias(hoje, 1) };
  if (c.periodo === "30d") return { desde: maisDias(hoje, -29), ate: maisDias(hoje, 1) };
  return { desde: c.de ? inicioDoDia(c.de) : undefined, ate: c.ate ? maisDias(c.ate, 1) : undefined };
}

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const formatoData = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });
const formatoHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** `08/10/2026, 14:26`, sempre com ano e no horário de Brasília. */
export function dataHora(d: Date | null | undefined, ausente = "—"): string {
  return d ? formatoDataHora.format(d) : ausente;
}
export function data(d: Date | null | undefined, ausente = "—"): string {
  return d ? formatoData.format(d) : ausente;
}
export function hora(d: Date): string {
  return formatoHora.format(d);
}

export function plural(n: number, um_: string, varios: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? um_ : varios}`;
}

/**
 * Busca, filtros e ordenação de uma seção cujos dados cabem inteiros na
 * memória do servidor (aplicações, conectores, integrações). A semântica é a
 * mesma das seções grandes; só o lugar onde a conta é feita muda.
 */
export function consultarEmMemoria<T>(
  itens: readonly T[],
  consulta: Consulta,
  regras: {
    id: (item: T) => string;
    busca: (item: T) => Array<string | null | undefined>;
    filtro: (item: T, chave: string) => string[];
    ordem: (item: T, campo: string) => ValorOrdenavel;
  },
): T[] {
  const filtrados = itens.filter((item) => passaNosFiltros(item, consulta.filtros, regras.filtro) && casaBusca(consulta.q, regras.busca(item)));
  return ordenar(filtrados, (item) => regras.ordem(item, consulta.ord), consulta.dir, regras.id);
}

/**
 * Cookie de sessão que leva a busca por CPF da tela ao servidor sem passar
 * pela URL. Fica aqui, e não no componente da barra, porque aquele arquivo é
 * de cliente: uma página de servidor que importasse a constante de lá
 * receberia uma referência, não o texto, e nunca acharia o cookie.
 */
export const COOKIE_BUSCA = "admin_busca";
