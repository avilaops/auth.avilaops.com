import { lerSessao } from "@/lib/sessao";
import { buscarFotoPerfil } from "@/lib/fotoPerfil";

export const dynamic = "force-dynamic";
export async function GET() {
  const sessao = await lerSessao();
  if (!sessao) return new Response(null, { status: 401 });
  const foto = await buscarFotoPerfil(sessao.sub);
  if (!foto) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(foto.bytes), { headers: {
    "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff",
  } });
}
