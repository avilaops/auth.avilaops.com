import sharp from "sharp";

export const MAX_FOTO_BYTES = 2 * 1024 * 1024;
export class FotoPerfilInvalida extends Error {}

/** Decodifica e regrava a imagem, descartando metadados e o arquivo original. */
export async function prepararFotoPerfil(bytes: Uint8Array, tipo: string): Promise<Buffer> {
  const formatos = new Map([["image/jpeg", "jpeg"], ["image/png", "png"], ["image/webp", "webp"]]);
  if (!formatos.has(tipo) || !bytes.length || bytes.length > MAX_FOTO_BYTES) throw new FotoPerfilInvalida("Use JPG, PNG ou WebP de até 2 MB.");
  try {
    const imagem = sharp(bytes, { limitInputPixels: 20_000_000, animated: false });
    const meta = await imagem.metadata();
    if (meta.format !== formatos.get(tipo) || (meta.pages ?? 1) > 1) throw new Error("Formato inválido");
    const foto = await imagem.rotate().resize(256, 256, { fit: "cover", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
    if (foto.length > 256 * 1024) throw new Error("Imagem grande");
    return foto;
  } catch {
    throw new FotoPerfilInvalida("Não foi possível ler a foto. Escolha outra imagem JPG, PNG ou WebP.");
  }
}
