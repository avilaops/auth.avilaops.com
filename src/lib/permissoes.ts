import { motivoDoAcesso, type AppRegistrado, type Papel } from "@/lib/apps";
import { buscarApp } from "@/lib/cadastro";
import { prisma } from "@/lib/prisma";

/**
 * Quem pode entrar onde.
 *
 * - ADMIN entra em tudo.
 * - CLIENTE entra em app aberto (`restrito` falso e `papelExigido` nulo) sem
 *   precisar de nada, e em app `restrito` só com permissão explícita.
 */
export async function podeEntrar(email: string, papel: Papel, app: AppRegistrado): Promise<boolean> {
  // Entra sem depender de permissão (equipe, ou app aberto)?
  if (motivoDoAcesso(app, papel, false)) return true;
  // Nem com permissão entraria (app só da equipe)? Então nem consulta o banco.
  if (!motivoDoAcesso(app, papel, true)) return false;
  const p = await prisma.permissao.findUnique({
    where: { email_appId: { email: email.toLowerCase(), appId: app.id } },
  });
  return !!p;
}

export async function listarPermissoes(email: string): Promise<string[]> {
  const rows = await prisma.permissao.findMany({ where: { email: email.toLowerCase() } });
  return rows.map((r) => r.appId);
}

export async function concederPermissao(email: string, appId: string, autor: string): Promise<void> {
  if (!(await buscarApp(appId))) throw new Error("App desconhecido");
  await prisma.permissao.upsert({
    where: { email_appId: { email: email.toLowerCase(), appId } },
    create: { email: email.toLowerCase(), appId, concedidoPor: autor },
    update: {},
  });
}

export async function revogarPermissao(email: string, appId: string): Promise<void> {
  await prisma.permissao.deleteMany({ where: { email: email.toLowerCase(), appId } });
}

/** Mapa appId → e-mails com acesso explícito (para a tela de apps). */
export async function permissoesPorApp(): Promise<Record<string, string[]>> {
  const rows = await prisma.permissao.findMany({ orderBy: { email: "asc" } });
  const mapa: Record<string, string[]> = {};
  for (const r of rows) (mapa[r.appId] ??= []).push(r.email);
  return mapa;
}
