import { cifrar, decifrar } from "@/lib/cripto";
import { prisma } from "@/lib/prisma";
import { PROVEDORES, buscarProvedor, type Provedor } from "@/lib/provedores";
import { urlAbsoluta } from "@/lib/urls";

export type ConectorEstado = {
  provedor: Provedor;
  ligado: boolean;
  configurado: boolean;
  clientId: string | null;
  /** últimos 4 do secret, para a tela; nunca o valor */
  secretFinal: string | null;
  extras: Record<string, string>;
  atualizadoEm: Date | null;
  atualizadoPor: string | null;
  redirectUri: string;
};

export function redirectUri(provedorId: string): string {
  return urlAbsoluta(`/api/auth/${provedorId}/callback`);
}

function lerExtras(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function completo(p: Provedor, clientId: string | null, temSecret: boolean, extras: Record<string, string>): boolean {
  if (!clientId) return false;
  // Apple não tem secret fixo: o que importa são os extras (chave privada).
  if (p.id !== "apple" && !temSecret) return false;
  for (const c of p.extras ?? []) if (c.obrigatorio && !extras[c.chave]) return false;
  return true;
}

export async function listarConectores(): Promise<ConectorEstado[]> {
  const linhas = await prisma.conector.findMany();
  const porId = new Map(linhas.map((l) => [l.id, l]));
  return PROVEDORES.map((p) => {
    const l = porId.get(p.id);
    const extras = lerExtras(l?.extras ?? null);
    let secretFinal: string | null = null;
    if (l?.clientSecretEnc) {
      try {
        secretFinal = decifrar(l.clientSecretEnc).slice(-4);
      } catch {
        secretFinal = "????";
      }
    }
    return {
      provedor: p,
      ligado: l?.ligado ?? false,
      configurado: completo(p, l?.clientId ?? null, Boolean(l?.clientSecretEnc), extras),
      clientId: l?.clientId ?? null,
      secretFinal,
      extras,
      atualizadoEm: l?.atualizadoEm ?? null,
      atualizadoPor: l?.atualizadoPor ?? null,
      redirectUri: redirectUri(p.id),
    };
  });
}

export async function conectoresLigados(): Promise<Provedor[]> {
  const linhas = await prisma.conector.findMany({ where: { ligado: true } });
  return linhas.map((l) => buscarProvedor(l.id)).filter((p): p is Provedor => !!p);
}

export type Credenciais = { clientId: string; clientSecret: string | null; extras: Record<string, string> };

/**
 * Credenciais em claro para usar no fluxo. `null` se desligado/incompleto.
 *
 * `mesmoDesligado` existe para o que usa o app do provedor sem ser login: a
 * conexão de ativos da Meta e os callbacks de exclusão precisam do segredo do
 * app mesmo com o botão "Entrar com Facebook" fora da tela de login.
 */
export async function credenciais(provedorId: string, opts: { mesmoDesligado?: boolean } = {}): Promise<Credenciais | null> {
  const p = buscarProvedor(provedorId);
  const l = await prisma.conector.findUnique({ where: { id: provedorId } });
  if (!p || !l || !l.clientId) return null;
  if (!l.ligado && !opts.mesmoDesligado) return null;
  const extras = lerExtras(l.extras);
  const clientSecret = l.clientSecretEnc ? decifrar(l.clientSecretEnc) : null;
  if (!completo(p, l.clientId, Boolean(clientSecret), extras)) return null;
  return { clientId: l.clientId, clientSecret, extras };
}

export async function salvarConector(
  provedorId: string,
  dados: { clientId: string; clientSecret?: string | null; extras: Record<string, string> },
  autor: string,
): Promise<void> {
  const p = buscarProvedor(provedorId);
  if (!p) throw new Error("Provedor desconhecido");

  const atual = await prisma.conector.findUnique({ where: { id: provedorId } });
  // Secret vazio no formulário = manter o que já está.
  const clientSecretEnc = dados.clientSecret ? cifrar(dados.clientSecret) : (atual?.clientSecretEnc ?? null);

  // Só guarda extras conhecidos; chave privada da Apple entra cifrada.
  const extras: Record<string, string> = {};
  for (const c of p.extras ?? []) {
    const v = (dados.extras[c.chave] ?? "").trim();
    if (c.chave === "privateKey") {
      const anterior = lerExtras(atual?.extras ?? null).privateKey;
      extras.privateKey = v ? cifrar(v) : (anterior ?? "");
    } else {
      extras[c.chave] = v || c.padrao || "";
    }
  }

  await prisma.conector.upsert({
    where: { id: provedorId },
    create: { id: provedorId, clientId: dados.clientId.trim(), clientSecretEnc, extras: JSON.stringify(extras), atualizadoPor: autor },
    update: { clientId: dados.clientId.trim(), clientSecretEnc, extras: JSON.stringify(extras), atualizadoPor: autor },
  });
}

export async function ligarConector(provedorId: string, ligado: boolean, autor: string): Promise<void> {
  await prisma.conector.upsert({
    where: { id: provedorId },
    create: { id: provedorId, ligado, atualizadoPor: autor },
    update: { ligado, atualizadoPor: autor },
  });
}

/** Contagem de vínculos por provedor, para a tela. */
export async function vinculosPorProvedor(): Promise<Record<string, number>> {
  const rows = await prisma.vinculo.groupBy({ by: ["provedor"], _count: { _all: true } });
  const m: Record<string, number> = {};
  for (const r of rows) m[r.provedor] = r._count._all;
  return m;
}
