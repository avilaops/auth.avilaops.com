import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";

/**
 * Login com a senha da loja (lojas.avilaops.com).
 *
 * Quem cria a loja pelo cadastro próprio do Lojas (`/criar`) tem conta só lá:
 * e-mail em `Tenant.loginEmail` e senha em `Tenant.senhaHash`. O e-mail foi
 * confirmado por link (ou veio do Google) antes de a conta nascer, então
 * provar a senha da loja prova a posse do endereço. É o mesmo raciocínio da
 * caixa de e-mail (`caixaEmail.ts`): o auth trata isso como um conector
 * (`provedor: lojas`), cria ou vincula a conta CLIENTE pelo e-mail e emite a
 * sessão normal. A senha da conta Avila Ops não é tocada.
 *
 * Só o DONO da loja. A equipe (`OperadorLoja`) fica de fora de propósito: quem
 * escolhe a senha dela é o lojista, com o e-mail que ele quiser, e aceitar
 * essa senha aqui deixaria um lojista entrar na conta Avila Ops de outra
 * pessoa. A equipe chega ao auth pelo convite do Lojas.
 *
 * A leitura é direta no banco `lojas`, por um usuário próprio que só enxerga
 * as colunas usadas aqui (`LOJAS_DATABASE_URL`). Sem a variável, o conector
 * fica desligado.
 */

let pool: Pool | null = null;

function getPool(): Pool | null {
  if (pool) return pool;
  const url = process.env.LOJAS_DATABASE_URL;
  if (!url) return null;
  pool = new Pool({ connectionString: url, max: 2 });
  return pool;
}

export type DonoDeLoja = { id: string; email: string };

type Linha = { id: string; loginEmail: string; senhaHash: string | null; status: string };

/** Mesmos parâmetros de `src/lib/sessao.ts` do Lojas: scrypt padrão do Node, chave do tamanho gravado. */
function derivar(senha: string, sal: Buffer, tamanho: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(senha, sal, tamanho, (erro, chave) => (erro ? reject(erro) : resolve(chave)));
  });
}

/** Confere `scrypt.<sal base64url>.<hash base64url>`, o formato do Lojas. Qualquer outro formato é recusa. */
export async function conferirSenhaDaLoja(senha: string, armazenado: string | null): Promise<boolean> {
  if (!armazenado) return false;
  const [alg, sal, hash] = armazenado.split(".");
  if (alg !== "scrypt" || !sal || !hash) return false;
  try {
    const esperado = Buffer.from(hash, "base64url");
    if (esperado.length < 16) return false;
    const calculado = await derivar(senha, Buffer.from(sal, "base64url"), esperado.length);
    return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

export async function autenticarDonoDeLoja(email: string, senha: string): Promise<DonoDeLoja | null> {
  const alvo = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(alvo)) return null;

  const p = getPool();
  if (!p) return null;

  let linha: Linha | undefined;
  try {
    const { rows } = await p.query<Linha>(
      `select id, "loginEmail", "senhaHash", status::text as status
         from "Tenant"
        where "loginEmail" = $1
        limit 1`,
      [alvo],
    );
    linha = rows[0];
  } catch {
    return null;
  }

  // Sem linha, gasta o tempo de uma verificação real: o relógio não pode
  // contar quem tem loja.
  const confere = linha
    ? await conferirSenhaDaLoja(senha, linha.senhaHash)
    : (await derivar(senha, randomBytes(16), 64).catch(() => undefined), false);
  // Loja cancelada não vira sessão Avila Ops.
  if (!linha || !confere || linha.status === "CANCELADA") return null;

  return { id: linha.id, email: linha.loginEmail.toLowerCase() };
}
