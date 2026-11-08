import assert from "node:assert/strict";
import { it } from "node:test";
import sharp from "sharp";
import { prepararFotoPerfil, FotoPerfilInvalida, MAX_FOTO_BYTES } from "@/lib/fotoPerfilImagem";

it("normaliza a foto em JPEG pequeno sem reter metadados do original", async () => {
  const original = await sharp({ create: { width: 600, height: 400, channels: 4, background: "#0054fe" } }).png().withMetadata().toBuffer();
  const foto = await prepararFotoPerfil(original, "image/png");
  const meta = await sharp(foto).metadata();
  assert.equal(meta.format, "jpeg"); assert.equal(meta.width, 256); assert.equal(meta.height, 256);
  assert.equal(meta.exif, undefined); assert.ok(foto.length < 256 * 1024);
});
it("recusa arquivo disfarçado, SVG, vazio e imagem acima do limite", async () => {
  await assert.rejects(prepararFotoPerfil(Buffer.from("<script>x</script>"), "image/png"), FotoPerfilInvalida);
  await assert.rejects(prepararFotoPerfil(Buffer.from("<svg/>"), "image/svg+xml"), FotoPerfilInvalida);
  await assert.rejects(prepararFotoPerfil(Buffer.alloc(0), "image/jpeg"), FotoPerfilInvalida);
  await assert.rejects(prepararFotoPerfil(Buffer.alloc(MAX_FOTO_BYTES + 1), "image/jpeg"), FotoPerfilInvalida);
});
it("não confia só no tipo MIME informado pelo navegador", async () => {
  const jpg = await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } }).jpeg().toBuffer();
  await assert.rejects(prepararFotoPerfil(jpg, "image/png"), FotoPerfilInvalida);
});
