import { papelDaRole, type Conta, type Role } from "@/lib/contas";
import { ROTULO_SEM_EMPRESA, SEM_EMPRESA, type Empresa } from "@/lib/empresas";
import {
  agrupar,
  casaBusca,
  ordenar,
  pareceCpf,
  passaNosFiltros,
  soDigitos,
  type Consulta,
  type DefLista,
  type Grupo,
  type ValorOrdenavel,
} from "@/lib/listagem";

/**
 * Listagem de contas do painel: o que se pode filtrar, ordenar e agrupar, e
 * como cada conta responde a isso. Puro, para ser testado sem banco.
 */

export const ROTULO_PAPEL: Record<Role, string> = {
  OWNER: "Plataforma",
  SOCIO: "Sócio",
  ADMIN: "Dono do negócio",
  CLIENT: "Equipe do cliente",
};
/** Ordem em que os papéis aparecem quando se ordena ou agrupa por papel. */
export const ORDEM_PAPEL: readonly Role[] = ["OWNER", "SOCIO", "ADMIN", "CLIENT"];

export type ContaListada = Conta & {
  empresaNome: string | null;
  /** O mais recente entre o acesso gravado na conta e o último login da auditoria. */
  ultimoAcesso: Date | null;
  segundoFator: boolean;
};

/** Junta à conta o que vem de outras fontes. O vínculo com a empresa é o gravado, nunca deduzido. */
export function montarContas(contas: Conta[], empresas: Empresa[], logins: Map<string, Date>, comFator: Set<string>): ContaListada[] {
  const nomes = new Map(empresas.map((e) => [e.id, e.nome]));
  return contas.map((c) => {
    const email = c.email.toLowerCase();
    const doEvento = logins.get(email) ?? null;
    const ultimoAcesso = c.ultimoAcessoEm && doEvento ? (c.ultimoAcessoEm > doEvento ? c.ultimoAcessoEm : doEvento) : (c.ultimoAcessoEm ?? doEvento);
    return {
      ...c,
      // Empresa apagada no outro banco: o vínculo existe, mas não aponta para nada legível.
      empresaNome: c.organizationId ? (nomes.get(c.organizationId) ?? null) : null,
      ultimoAcesso,
      segundoFator: comFator.has(email),
    };
  });
}

export function defContas(empresas: Empresa[], contas: ContaListada[]): DefLista {
  const comConta = new Set(contas.map((c) => c.organizationId).filter(Boolean));
  return {
    filtros: [
      {
        chave: "empresa",
        rotulo: "Empresa",
        tipo: "multi",
        opcoes: [...empresas.filter((e) => comConta.has(e.id)).map((e) => ({ valor: e.id, rotulo: e.nome })), { valor: SEM_EMPRESA, rotulo: ROTULO_SEM_EMPRESA }],
      },
      { chave: "tipo", rotulo: "Tipo de acesso", tipo: "unico", opcoes: [{ valor: "equipe", rotulo: "Equipe Avila Ops" }, { valor: "cliente", rotulo: "Clientes" }] },
      { chave: "papel", rotulo: "Perfil", tipo: "multi", opcoes: ORDEM_PAPEL.map((p) => ({ valor: p, rotulo: ROTULO_PAPEL[p] })) },
      { chave: "estado", rotulo: "Estado da conta", tipo: "unico", opcoes: [{ valor: "ativa", rotulo: "Ativa" }, { valor: "desligada", rotulo: "Desligada" }] },
      { chave: "senha", rotulo: "Senha", tipo: "unico", opcoes: [{ valor: "provisoria", rotulo: "Provisória" }, { valor: "definida", rotulo: "Definida" }] },
      { chave: "fator", rotulo: "Verificação em duas etapas", tipo: "unico", opcoes: [{ valor: "com", rotulo: "Ativada" }, { valor: "sem", rotulo: "Não ativada" }] },
      {
        chave: "acesso",
        rotulo: "Último acesso",
        tipo: "unico",
        opcoes: [
          { valor: "nunca", rotulo: "Nunca acessou" },
          { valor: "7d", rotulo: "Nos últimos 7 dias" },
          { valor: "30d", rotulo: "Nos últimos 30 dias" },
          { valor: "mais30", rotulo: "Há mais de 30 dias" },
        ],
      },
    ],
    ordens: [
      { campo: "nome", rotulo: "Nome" },
      { campo: "empresa", rotulo: "Empresa" },
      { campo: "papel", rotulo: "Perfil", rotulos: ["plataforma primeiro", "equipe do cliente primeiro"] },
      { campo: "estado", rotulo: "Estado", rotulos: ["ativas primeiro", "desligadas primeiro"] },
      { campo: "acesso", rotulo: "Último acesso", padrao: "desc", rotulos: ["mais antigo", "mais recente"] },
      { campo: "criada", rotulo: "Criação", padrao: "desc", rotulos: ["mais antiga", "mais recente"] },
    ],
    grupos: [
      { valor: "empresa", rotulo: "Empresa" },
      { valor: "papel", rotulo: "Perfil" },
      { valor: "estado", rotulo: "Estado" },
    ],
    ordemInicial: { campo: "nome", dir: "asc" },
  };
}

const DIA_MS = 86_400_000;

function valoresDoFiltro(c: ContaListada, chave: string, agora: number): string[] {
  switch (chave) {
    case "empresa": return [c.organizationId ?? SEM_EMPRESA];
    case "tipo": return [papelDaRole(c.role) === "ADMIN" ? "equipe" : "cliente"];
    case "papel": return [c.role];
    case "estado": return [c.ativa ? "ativa" : "desligada"];
    case "senha": return [c.senhaProvisoria ? "provisoria" : "definida"];
    case "fator": return [c.segundoFator ? "com" : "sem"];
    case "acesso": {
      if (!c.ultimoAcesso) return ["nunca"];
      const dias = (agora - c.ultimoAcesso.getTime()) / DIA_MS;
      // Quem acessou há 3 dias está nos "últimos 7" e também nos "últimos 30".
      return dias <= 7 ? ["7d", "30d"] : dias <= 30 ? ["30d"] : ["mais30"];
    }
    default: return [];
  }
}

function valorDaOrdem(c: ContaListada, campo: string): ValorOrdenavel {
  switch (campo) {
    case "empresa": return c.empresaNome;
    case "papel": return ORDEM_PAPEL.indexOf(c.role);
    case "estado": return c.ativa ? 0 : 1;
    case "acesso": return c.ultimoAcesso;
    case "criada": return c.criadoEm;
    default: return c.nome;
  }
}

/**
 * Aplica busca, filtros e ordenação sobre todas as contas.
 *
 * A busca olha nome e e-mail sem diferenciar acento ou maiúscula. Texto que
 * parece CPF é comparado só pelos dígitos, com o CPF da conta.
 */
export function consultarContas(contas: ContaListada[], consulta: Consulta, busca: string, agora = Date.now()): ContaListada[] {
  const digitos = pareceCpf(busca) ? soDigitos(busca) : "";
  const filtradas = contas.filter((c) => {
    if (!passaNosFiltros(c, consulta.filtros, (item, chave) => valoresDoFiltro(item, chave, agora))) return false;
    if (!busca) return true;
    if (digitos) return soDigitos(c.cpf).includes(digitos) || soDigitos(c.telefone).includes(digitos);
    return casaBusca(busca, [c.nome, c.email]);
  });
  return ordenar(filtradas, (c) => valorDaOrdem(c, consulta.ord), consulta.dir, (c) => c.id);
}

export function agruparContas(contas: ContaListada[], grupo: string): Grupo<ContaListada>[] {
  if (grupo === "papel") return agrupar(contas, (c) => ({ chave: c.role, rotulo: ROTULO_PAPEL[c.role] }), ORDEM_PAPEL);
  if (grupo === "estado") return agrupar(contas, (c) => (c.ativa ? { chave: "ativa", rotulo: "Ativas" } : { chave: "desligada", rotulo: "Desligadas" }), ["ativa", "desligada"]);
  return agrupar(contas, (c) => (c.organizationId ? { chave: c.organizationId, rotulo: c.empresaNome ?? "Empresa não encontrada" } : { chave: "", rotulo: ROTULO_SEM_EMPRESA }));
}
