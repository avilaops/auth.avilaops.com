import { poolPortal } from "@/lib/contas";

export async function buscarFotoPerfil(contaId: string): Promise<{ bytes: Buffer; atualizadoEm: Date } | null> {
  const { rows } = await poolPortal().query<{ foto_perfil: Buffer | null; atualizado_em: Date }>(
    "SELECT foto_perfil, atualizado_em FROM portal_clients WHERE id=$1 AND ativo", [contaId],
  );
  return rows[0]?.foto_perfil ? { bytes: rows[0].foto_perfil, atualizadoEm: rows[0].atualizado_em } : null;
}

export async function salvarFotoPerfil(contaId: string, foto: Buffer | null): Promise<boolean> {
  const { rowCount } = await poolPortal().query(
    "UPDATE portal_clients SET foto_perfil=$2, atualizado_em=now() WHERE id=$1 AND ativo", [contaId, foto],
  );
  return rowCount === 1;
}
