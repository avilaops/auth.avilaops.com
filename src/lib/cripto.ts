import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Cifra segredos de conectores em repouso (AES-256-GCM).
 *
 * A chave vive só no `.env` do servidor. Um dump do banco não entrega os
 * client secrets; quem tem a chave mas não o banco também não tem nada.
 * Formato guardado: `v1:<iv b64>:<tag b64>:<dados b64>`.
 */

function chave(): Buffer {
  const hex = process.env.AUTH_ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("AUTH_ENCRYPTION_KEY ausente ou inválida (precisa de 64 hex = 32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${dados.toString("base64")}`;
}

export function decifrar(blob: string): string {
  const [v, iv, tag, dados] = blob.split(":");
  if (v !== "v1" || !iv || !tag || !dados) throw new Error("segredo em formato desconhecido");
  const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(dados, "base64")), d.final()]).toString("utf8");
}

export function chaveConfigurada(): boolean {
  try {
    chave();
    return true;
  } catch {
    return false;
  }
}
