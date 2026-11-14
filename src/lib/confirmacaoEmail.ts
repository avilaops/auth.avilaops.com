import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { poolPortal } from "@/lib/contas";

const VALIDADE = 30 * 60_000;
const INTERVALO = 60_000;
const JANELA = 60 * 60_000;
type ContaEmail = { nome: string; email: string; ativo: boolean; email_verificado: boolean; email_confirmacao_versao: string };
type Desafio = { token_hash: string; conta_id: string; email: string; versao: string; criado_em: Date; expira_em: Date; usado_em: Date | null; janela_em: Date; envios: number };
export type SolicitacaoConfirmacao = { tipo: "enviar"; token: string; email: string; nome: string }
  | { tipo: "aguardar"; repetirEm: number } | { tipo: "confirmada" | "invalida" };
export type ResultadoConfirmacao = { tipo: "confirmado"; email: string; contaId: string } | { tipo: "usado" | "invalido" };
const normalizar = (email: string) => email.trim().toLowerCase();
const hashDoToken = (token: string) => /^[a-f0-9]{64}$/.test(token) ? createHash("sha256").update(token).digest("hex") : null;

async function transacao<T>(operar: (sql: PoolClient) => Promise<T>): Promise<T> {
  const sql = await poolPortal().connect();
  try {
    await sql.query("BEGIN");
    await sql.query("SET LOCAL statement_timeout='10s'");
    const resultado = await operar(sql);
    await sql.query("COMMIT");
    return resultado;
  } catch (erro) {
    await sql.query("ROLLBACK").catch(() => undefined);
    throw erro;
  } finally { sql.release(); }
}

/** Reserva serializada pela conta: limite e emissão não disputam entre réplicas. */
export async function solicitarConfirmacaoEmail(contaId: string, emailDaSessao: string, agora = new Date()): Promise<SolicitacaoConfirmacao> {
  return transacao(async (sql) => {
    const conta = (await sql.query<ContaEmail>("SELECT nome,email,ativo,email_verificado,email_confirmacao_versao FROM portal_clients WHERE id=$1 FOR UPDATE", [contaId])).rows[0];
    if (!conta?.ativo || normalizar(conta.email) !== normalizar(emailDaSessao)) return { tipo: "invalida" };
    if (conta.email_verificado) return { tipo: "confirmada" };
    const anterior = (await sql.query<Desafio>("SELECT * FROM portal_email_confirmacoes WHERE conta_id=$1", [contaId])).rows[0];
    const mesmaJanela = anterior && agora.getTime() - anterior.janela_em.getTime() < JANELA;
    const esperaMinuto = anterior ? anterior.criado_em.getTime() + INTERVALO - agora.getTime() : 0;
    const esperaJanela = mesmaJanela && anterior.envios >= 3 ? anterior.janela_em.getTime() + JANELA - agora.getTime() : 0;
    if (Math.max(esperaMinuto, esperaJanela) > 0) return { tipo: "aguardar", repetirEm: Math.ceil(Math.max(esperaMinuto, esperaJanela) / 1000) };
    const token = randomBytes(32).toString("hex");
    await sql.query(`INSERT INTO portal_email_confirmacoes (token_hash,conta_id,email,versao,criado_em,expira_em,janela_em,envios)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (conta_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,email=EXCLUDED.email,versao=EXCLUDED.versao,
        criado_em=EXCLUDED.criado_em,expira_em=EXCLUDED.expira_em,usado_em=NULL,janela_em=EXCLUDED.janela_em,envios=EXCLUDED.envios`,
    [hashDoToken(token), contaId, normalizar(conta.email), conta.email_confirmacao_versao, agora,
      new Date(agora.getTime() + VALIDADE), mesmaJanela ? anterior.janela_em : agora, mesmaJanela ? anterior.envios + 1 : 1]);
    return { tipo: "enviar", token, email: normalizar(conta.email), nome: conta.nome };
  });
}

function situacao(desafio: Desafio | undefined, conta: ContaEmail | undefined, agora: Date): "valido" | "usado" | "invalido" {
  if (!desafio || !conta?.ativo || desafio.versao !== conta.email_confirmacao_versao
    || desafio.email !== normalizar(conta.email) || desafio.expira_em.getTime() <= agora.getTime()) return "invalido";
  return desafio.usado_em ? "usado" : "valido";
}

/** Consulta de GET é somente leitura; robôs de e-mail não consomem o link. */
export async function estadoConfirmacaoEmail(token: string, agora = new Date()): Promise<"valido" | "usado" | "invalido"> {
  const hash = hashDoToken(token);
  if (!hash) return "invalido";
  const desafio = (await poolPortal().query<Desafio>("SELECT * FROM portal_email_confirmacoes WHERE token_hash=$1", [hash])).rows[0];
  if (!desafio) return "invalido";
  const conta = (await poolPortal().query<ContaEmail>("SELECT email,ativo,email_verificado,email_confirmacao_versao FROM portal_clients WHERE id=$1", [desafio.conta_id])).rows[0];
  return situacao(desafio, conta, agora);
}

/** Consome o link e confirma somente o endereço/versionamento correspondente. */
export async function confirmarEmail(token: string, agora = new Date()): Promise<ResultadoConfirmacao> {
  const hash = hashDoToken(token);
  if (!hash) return { tipo: "invalido" };
  return transacao(async (sql) => {
    const referencia = (await sql.query<{ conta_id: string }>("SELECT conta_id FROM portal_email_confirmacoes WHERE token_hash=$1", [hash])).rows[0];
    if (!referencia) return { tipo: "invalido" };
    // Mesma ordem de locks da emissão: conta antes do desafio.
    const conta = (await sql.query<ContaEmail>("SELECT email,ativo,email_verificado,email_confirmacao_versao FROM portal_clients WHERE id=$1 FOR UPDATE", [referencia.conta_id])).rows[0];
    const desafio = (await sql.query<Desafio>("SELECT * FROM portal_email_confirmacoes WHERE token_hash=$1 FOR UPDATE", [hash])).rows[0];
    const estado = situacao(desafio, conta, agora);
    if (estado !== "valido") return { tipo: estado };
    await sql.query("UPDATE portal_clients SET email_verificado=true,atualizado_em=$2 WHERE id=$1", [referencia.conta_id, agora]);
    await sql.query("UPDATE portal_email_confirmacoes SET usado_em=$2 WHERE token_hash=$1", [hash, agora]);
    return { tipo: "confirmado", email: desafio.email, contaId: referencia.conta_id };
  });
}
