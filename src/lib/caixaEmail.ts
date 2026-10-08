import bcrypt from "bcryptjs";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { Pool } from "pg";

/**
 * Login com a senha da caixa de e-mail (avila-mail).
 *
 * Cliente que só comprou e-mail não tem conta em `portal_clients` — a
 * credencial dele é a da caixa. Provar a senha da caixa prova a posse do
 * endereço, então o auth trata isso como um conector (`provedor: mail`): cria
 * ou vincula a conta CLIENTE pelo e-mail e emite a sessão normal.
 *
 * A verificação é direta no banco `avila_mail`, por um pool próprio
 * somente-leitura. Nada de HTTP: a API do mail escuta no loopback do host, e um
 * fetch do container sairia para a internet e voltaria (hairpin pelo
 * Cloudflare) — que é lento e falha.
 *
 * Dois formatos de hash convivem, e é obrigatório aceitar os dois: o mail
 * passou a gravar `$scrypt$…` em 26/08/2026 (o bcryptjs, JavaScript puro,
 * levava mais de um minuto sob o `--jitless` que os serviços usam), e as caixas
 * antigas continuam em bcrypt até o dono entrar uma vez. Verificar só bcrypt
 * aqui recusava toda caixa criada depois daquela data — com a senha certa.
 */

let pool: Pool | null = null;

function getPool(): Pool | null {
  if (pool) return pool;
  const url = process.env.MAIL_DATABASE_URL;
  if (!url) return null;
  pool = new Pool({ connectionString: url, max: 3 });
  return pool;
}

export type CaixaAutenticada = { id: string; address: string; displayName: string | null };

type Linha = { id: string; address: string; display_name: string | null; password_hash: string; status: string };

// Mesmo tempo para caixa inexistente e senha errada: sem isto o relógio denuncia quais endereços existem.
const HASH_DESCARTAVEL = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO3Jj5w3s4a5s6d7f8g9h0i1j2k3l4m5n";

/** Parâmetros do scrypt — os mesmos de `src/lib/password.ts` no avila-mail. */
const SCRYPT = { N: 1 << 15, r: 8, p: 1, keylen: 32, maxmem: 64 * 1024 * 1024 } as const;

function derivar(senha: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(senha, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem }, (erro, chave) =>
      erro ? reject(erro) : resolve(chave),
    );
  });
}

/** Aceita os dois formatos: `$scrypt$…` (novo) e `$2a$…` (bcrypt legado). */
async function conferirSenha(senha: string, hash: string): Promise<boolean> {
  try {
    if (hash.startsWith("$scrypt$")) {
      const [, , , saltB64, chaveB64] = hash.split("$");
      if (!saltB64 || !chaveB64) return false;
      const esperada = Buffer.from(chaveB64, "base64");
      const obtida = await derivar(senha, Buffer.from(saltB64, "base64"));
      return obtida.length === esperada.length && timingSafeEqual(obtida, esperada);
    }
    return await bcrypt.compare(senha, hash);
  } catch {
    return false;
  }
}

export async function autenticarCaixa(address: string, senha: string): Promise<CaixaAutenticada | null> {
  const endereco = address.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(endereco)) return null;
  const [localPart, dominio] = endereco.split("@");

  const p = getPool();
  if (!p) return null;

  let linha: Linha | undefined;
  try {
    const { rows } = await p.query<Linha>(
      `select m.id,
              m.local_part || '@' || d.name as address,
              m.display_name,
              m.password_hash,
              m.status
         from mail_mailboxes m
         join mail_domains d on d.id = m.domain_id
        where m.local_part = $1 and lower(d.name) = $2
        limit 1`,
      [localPart, dominio],
    );
    linha = rows[0];
  } catch {
    return null;
  }

  // Sem linha, gasta o tempo de uma verificação real (scrypt com salt jogado
  // fora) — o formato do hash de quem existe não pode vazar pelo relógio.
  const confere = linha
    ? await conferirSenha(senha, linha.password_hash)
    : (await derivar(senha, randomBytes(16)).catch(() => undefined), false);
  // Só caixa ativa vira sessão Avila Ops. Suspensa/desativada não entra por aqui.
  if (!linha || !confere || linha.status !== "active") return null;

  return { id: linha.id, address: linha.address.toLowerCase(), displayName: linha.display_name };
}

export type CaixaDoDono = {
  address: string;
  displayName: string | null;
  status: string;
  usadoBytes: number;
  cotaBytes: number;
};

/**
 * Caixas de e-mail que pertencem a esta conta: as que têm `owner_email` igual
 * ao e-mail da sessão, ou aquela cujo próprio endereço é o e-mail (cliente que
 * só comprou e-mail e entra com a senha da caixa). Alimenta o "Seus e-mails"
 * da página da conta.
 */
export async function caixasDoDono(email: string): Promise<CaixaDoDono[]> {
  const p = getPool();
  if (!p) return [];
  const e = email.trim().toLowerCase();
  try {
    const { rows } = await p.query<{
      address: string;
      display_name: string | null;
      status: string;
      used_bytes: string;
      quota_bytes: string;
    }>(
      `select m.local_part || '@' || d.name as address, m.display_name, m.status,
              m.used_bytes, m.quota_bytes
         from mail_mailboxes m
         join mail_domains d on d.id = m.domain_id
        where lower(m.owner_email) = $1 or lower(m.local_part || '@' || d.name) = $1
        order by m.local_part || '@' || d.name`,
      [e],
    );
    return rows.map((r) => ({
      address: r.address.toLowerCase(),
      displayName: r.display_name,
      status: r.status,
      // bigint volta como string no pg; a cota (GB) cabe folgado em Number.
      usadoBytes: Number(r.used_bytes) || 0,
      cotaBytes: Number(r.quota_bytes) || 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Domínios de e-mail hospedados no avila-mail e ativos: são as opções de
 * "criar caixa em" no painel. `avilaops.com` vem primeiro (a caixa genérica da
 * casa); os demais são os domínios empresariais dos clientes. Domínios de
 * teste não aparecem.
 */
export async function dominiosHospedados(): Promise<string[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const { rows } = await p.query<{ name: string }>(
      `select name
         from mail_domains
        where status = 'active' and name not like 'teste.%'
        order by (name <> 'avilaops.com'), name`,
    );
    return rows.map((r) => r.name.toLowerCase());
  } catch {
    return [];
  }
}
