import bcrypt from "bcryptjs";
import { randomInt, randomUUID } from "crypto";
import { Pool } from "pg";
import type { Papel } from "@/lib/apps";

/**
 * Contas do portfólio.
 *
 * Vivem em `portal_clients`, no banco `cliente_portal` — o banco do
 * `app.avilaops.com` (o nome é herança do portal antigo; o portal do cliente
 * será reconstruído depois, em cima disto). O auth **não** duplica usuário:
 * quem já entra no app continua entrando com a mesma credencial, e trocar a
 * senha aqui vale para todos.
 *
 * `role = 'ADMIN'` é a equipe Avila Ops; `role = 'CLIENT'` é cliente. O papel
 * do SSO deriva daí.
 *
 * A conexão é separada da do Prisma de propósito: o Prisma daqui aponta para
 * `avilaops-auth` (sessões, permissões, auditoria), e o Postgres não faz
 * consulta entre bancos diferentes.
 */

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.PORTAL_DATABASE_URL;
  if (!url) throw new Error("PORTAL_DATABASE_URL não configurado");
  pool = new Pool({ connectionString: url, max: 3 });
  return pool;
}

/**
 * OWNER e o dono da operacao (uma conta so), ADMIN e a equipe e as automacoes,
 * CLIENT e quem contrata. Sao tres coisas diferentes, nao graus da mesma:
 * dinheiro, segredo e acesso sao do dono; a operacao e da equipe; o cliente ve
 * a propria empresa. Ver `app.avilaops.com/README.md`.
 */
export type Role = "OWNER" | "SOCIO" | "ADMIN" | "CLIENT";

const PAPEIS: readonly Role[] = ["OWNER", "SOCIO", "ADMIN", "CLIENT"];

/**
 * Papel vindo do banco ou de um formulario.
 *
 * Antes isto era `v === "ADMIN" ? "ADMIN" : "CLIENT"`, o que **rebaixava o dono
 * a cliente** assim que alguem salvasse a conta dele no painel. Papel
 * desconhecido vira CLIENT (o menos poderoso), nunca o contrario.
 *
 * **A mesma armadilha pegou o SOCIO em 11/09/2026.** O app.avilaops.com criou o
 * papel em 04/09 (o Abraao, que opera tudo menos o caixa) e esta lista nunca
 * foi atualizada. Resultado: todo login do Abraao lia SOCIO do banco, virava
 * CLIENT aqui, CLIENTE no token, e o app.avilaops.com respondia "sua conta nao
 * tem acesso". Ele ficou uma semana trancado fora sem ninguem saber, porque o
 * rebaixamento e silencioso: nao ha erro, so um papel menor.
 *
 * Papel novo no app entra AQUI no mesmo commit, e nos dois seletores do painel
 * (`admin/contas/nova` e `admin/contas/[id]`). Faltando o seletor, salvar a
 * conta pelo painel grava CLIENT no banco e o rebaixamento vira permanente.
 */
export function papelValido(v: string | null | undefined): Role {
  return PAPEIS.includes(v as Role) ? (v as Role) : "CLIENT";
}

export type Conta = {
  id: string;
  nome: string;
  email: string;
  cpf: string | null;
  telefone: string | null;
  role: Role;
  senhaProvisoria: boolean;
  criadoEm: Date;
  /** Conta desligada nao entra em lugar nenhum; o historico fica. */
  ativa: boolean;
  /** Empresa que a conta representa (so CLIENT). */
  organizationId: string | null;
  ultimoAcessoEm: Date | null;
};

type Linha = {
  id: string;
  nome: string;
  email: string;
  cpf: string | null;
  telefone: string | null;
  role: string;
  senha_hash: string;
  senha_provisoria: boolean;
  criado_em: Date;
  ativo: boolean;
  organization_id: string | null;
  ultimo_acesso_em: Date | null;
};

const COLUNAS =
  "id, nome, email, cpf, telefone, role, senha_hash, senha_provisoria, criado_em, ativo, organization_id, ultimo_acesso_em";

function daLinha(l: Linha): Conta {
  return {
    id: l.id,
    nome: l.nome,
    email: l.email,
    cpf: l.cpf,
    telefone: l.telefone,
    role: papelValido(l.role),
    senhaProvisoria: l.senha_provisoria,
    criadoEm: l.criado_em,
    ativa: l.ativo,
    organizationId: l.organization_id,
    ultimoAcessoEm: l.ultimo_acesso_em,
  };
}

/**
 * Papel que a sessao do SSO carrega.
 *
 * `Papel` tem dois valores porque e nivel de acesso, nao cargo: ou a pessoa e
 * da casa, ou e cliente. OWNER e o dono da operacao, entao entra como ADMIN
 * aqui. Mapea-lo para CLIENTE trancava o dono para fora do proprio painel: o
 * app `app.avilaops.com` exige ADMIN, e o login dele respondia "sua conta nao
 * tem acesso" (visto em 01/09/2026).
 *
 * E a MESMA armadilha que o `papelValido` acima ja tinha levado a correcao:
 * comparacao de dois valores num tipo que passou a ter tres rebaixa o papel
 * novo em silencio. O papel fino (OWNER x ADMIN) nao cabe neste token — mora
 * em `portal_clients`, e cada app le de la.
 */
export function papelDaRole(role: Role): Papel {
  return role === "CLIENT" ? "CLIENTE" : "ADMIN";
}

/**
 * Hash descartável para quando o usuário não existe.
 *
 * Sem isto, "login inexistente" responde na hora e "senha errada" demora o
 * tempo do bcrypt — a diferença permite enumerar quem tem conta.
 */
const HASH_DESCARTAVEL = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function autenticar(login: string, senha: string): Promise<Conta | null> {
  const normalizado = login.trim().toLowerCase();
  const cpf = normalizado.replace(/\D/g, "");

  const { rows } = await getPool().query<Linha>(
    `select ${COLUNAS} from portal_clients
      where lower(email) = $1 or ($2 <> '' and cpf = $2)
      limit 1`,
    [normalizado, cpf.length === 11 ? cpf : ""],
  );

  const linha = rows[0];
  const confere = await bcrypt.compare(senha, linha?.senha_hash ?? HASH_DESCARTAVEL);
  if (!linha || !confere) return null;
  // Conta desligada e recusada com a mesma resposta de senha errada: quem foi
  // desligado nao precisa saber se o e-mail ainda existe.
  if (!linha.ativo) return null;
  await marcarAcesso(linha.id);
  return daLinha(linha);
}

export async function listarContas(
  busca?: string,
  opcoes: { papel?: Role | ""; incluirDesligadas?: boolean } = {},
): Promise<Conta[]> {
  const termo = busca?.trim().toLowerCase() ?? "";
  const { rows } = await getPool().query<Linha>(
    `select ${COLUNAS} from portal_clients
      where ($1 = '' or lower(email) like $2 or lower(nome) like $2 or cpf like $2)
        and ($3 = '' or role = $3)
        and ($4 or ativo)
      order by case role when 'OWNER' then 0 when 'ADMIN' then 1 else 2 end, lower(nome)
      limit 500`,
    [termo, `%${termo}%`, opcoes.papel ?? "", opcoes.incluirDesligadas ?? false],
  );
  return rows.map(daLinha);
}

/** Quantas contas por papel, para o painel abrir com o retrato do dia. */
export async function contarPorPapel(): Promise<{ papel: Role; ativas: number; desligadas: number }[]> {
  const { rows } = await getPool().query<{ role: string; ativas: string; desligadas: string }>(
    `select role,
            count(*) filter (where ativo) as ativas,
            count(*) filter (where not ativo) as desligadas
       from portal_clients group by role`,
  );
  return rows.map((r) => ({ papel: papelValido(r.role), ativas: Number(r.ativas), desligadas: Number(r.desligadas) }));
}

/** Ultimo acesso, gravado no login. Falha aqui nao pode derrubar o login. */
async function marcarAcesso(id: string): Promise<void> {
  try {
    await getPool().query(`update portal_clients set ultimo_acesso_em = now() where id = $1`, [id]);
  } catch (erro) {
    console.error("[contas] nao consegui gravar o ultimo acesso", erro);
  }
}

/**
 * Liga ou desliga a conta.
 *
 * Desligar e sempre melhor que apagar: a linha tem pedido, dominio e auditoria
 * atras dela, e `removerConta` so passa quando nada aponta para ca.
 */
export async function definirAtiva(id: string, ativa: boolean): Promise<Conta | null> {
  const { rows } = await getPool().query<Linha>(
    `update portal_clients set ativo = $1, atualizado_em = now() where id = $2 returning ${COLUNAS}`,
    [ativa, id],
  );
  return rows[0] ? daLinha(rows[0]) : null;
}

/** Liga a conta a empresa que ela representa (so faz sentido para CLIENT). */
export async function vincularOrganizacao(id: string, organizationId: string | null): Promise<Conta | null> {
  const { rows } = await getPool().query<Linha>(
    `update portal_clients set organization_id = $1, atualizado_em = now() where id = $2 returning ${COLUNAS}`,
    [organizationId, id],
  );
  return rows[0] ? daLinha(rows[0]) : null;
}

export async function buscarConta(id: string): Promise<Conta | null> {
  const { rows } = await getPool().query<Linha>(
    `select ${COLUNAS} from portal_clients where id = $1`,
    [id],
  );
  return rows[0] ? daLinha(rows[0]) : null;
}

export async function buscarContaPorEmail(email: string): Promise<Conta | null> {
  const { rows } = await getPool().query<Linha>(
    `select ${COLUNAS} from portal_clients where lower(email) = $1 limit 1`,
    [email.trim().toLowerCase()],
  );
  return rows[0] ? daLinha(rows[0]) : null;
}

/** Mesmo alfabeto do app: sem 0/O/1/I/L, para ditar por telefone. */
export function gerarSenhaProvisoria(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 12 }, () => chars[randomInt(chars.length)]).join("");
}

export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, 10);
}

export type NovaConta = {
  nome: string;
  email: string;
  cpf?: string | null;
  telefone?: string | null;
  role: Role;
};

/** Cria a conta com senha provisória e devolve a senha em claro — uma vez só. */
export async function criarConta(dados: NovaConta): Promise<{ conta: Conta; senha: string }> {
  const senha = gerarSenhaProvisoria();
  const id = randomUUID();
  const cpf = dados.cpf?.replace(/\D/g, "") || null;
  const { rows } = await getPool().query<Linha>(
    `insert into portal_clients (id, nome, email, cpf, telefone, role, senha_hash, senha_provisoria)
     values ($1, $2, $3, $4, $5, $6, $7, true)
     returning ${COLUNAS}`,
    [id, dados.nome.trim(), dados.email.trim().toLowerCase(), cpf, dados.telefone || null, dados.role, await hashSenha(senha)],
  );
  return { conta: daLinha(rows[0]), senha };
}

export async function atualizarConta(
  id: string,
  dados: Partial<Pick<NovaConta, "nome" | "email" | "cpf" | "telefone" | "role">>,
): Promise<Conta | null> {
  const sets: string[] = [];
  const valores: unknown[] = [];
  const add = (coluna: string, valor: unknown) => {
    valores.push(valor);
    sets.push(`${coluna} = $${valores.length}`);
  };
  if (dados.nome !== undefined) add("nome", dados.nome.trim());
  if (dados.email !== undefined) add("email", dados.email.trim().toLowerCase());
  if (dados.cpf !== undefined) add("cpf", dados.cpf?.replace(/\D/g, "") || null);
  if (dados.telefone !== undefined) add("telefone", dados.telefone || null);
  if (dados.role !== undefined) add("role", papelValido(dados.role));
  if (!sets.length) return buscarConta(id);
  add("atualizado_em", new Date());

  valores.push(id);
  const { rows } = await getPool().query<Linha>(
    `update portal_clients set ${sets.join(", ")} where id = $${valores.length} returning ${COLUNAS}`,
    valores,
  );
  return rows[0] ? daLinha(rows[0]) : null;
}

/** Define uma senha escolhida (admin ou o próprio usuário). */
export async function definirSenha(id: string, senha: string, provisoria = false): Promise<void> {
  await getPool().query(
    `update portal_clients set senha_hash = $1, senha_provisoria = $2, atualizado_em = now() where id = $3`,
    [await hashSenha(senha), provisoria, id],
  );
}

/** Gera uma provisória nova e devolve em claro — uma vez só. */
export async function redefinirSenhaProvisoria(id: string): Promise<string> {
  const senha = gerarSenhaProvisoria();
  await definirSenha(id, senha, true);
  return senha;
}

/**
 * Remover a conta é destrutivo e a tabela tem FKs do app (pedidos,
 * domínios…). Se houver vínculo, o Postgres recusa e o erro sobe — é o
 * comportamento desejado: nada de apagar histórico em cascata daqui.
 */
export async function removerConta(id: string): Promise<void> {
  await getPool().query(`delete from portal_clients where id = $1`, [id]);
}
