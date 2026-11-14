import type { EmailParaEnviar } from "@/lib/email";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { baseDoAuthLocal } from "@/lib/baseDaAplicacao";

export function emailLocalHabilitado(env: Record<string, string | undefined> = process.env): boolean {
  return baseDoAuthLocal(env) !== null;
}

/** Sem endpoint HTTP: mensagens e links sensíveis ficam somente no disco local. */
export async function gravarEmailLocal(email: EmailParaEnviar, diretorio = path.join(process.cwd(), ".local/auth/emails")): Promise<{ messageId: string }> {
  const messageId = randomUUID();
  await mkdir(diretorio, { recursive: true, mode: 0o700 });
  await writeFile(path.join(diretorio, `${messageId}.json`), JSON.stringify({ messageId, criadoEm: new Date().toISOString(), email }, null, 2),
    { encoding: "utf8", flag: "wx", mode: 0o600 });
  return { messageId };
}
