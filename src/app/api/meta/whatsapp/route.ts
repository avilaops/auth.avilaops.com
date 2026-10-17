import { NextRequest, NextResponse } from "next/server";
import { lerPedidoCadastro } from "@/lib/cadastroWhatsapp";
import { appMeta, ligarWhatsapp } from "@/lib/conexaoMeta";
import { registrar } from "@/lib/eventos";
import { limitar } from "@/lib/rateLimit";
import { lerSessao } from "@/lib/sessao";
import { baseUrl } from "@/lib/urls";

export const runtime = "nodejs";

function resposta(corpo: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Fim do cadastro incorporado do WhatsApp: `POST /api/meta/whatsapp`.
 *
 * Quem chama é a tela `/conta/meta`, com o código e os identificadores que a
 * janela da Meta devolveu. Só aceita pedido da própria origem do Auth e com
 * sessão: o código vale 30 segundos, mas grava um número no cadastro de quem
 * estiver logado.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== new URL(baseUrl()).origin) return resposta({ erro: "Origem não permitida." }, 403);
  const sessao = await lerSessao();
  if (!sessao) return resposta({ erro: "Sua sessão terminou. Entre de novo." }, 401);
  if (!(await limitar(`meta-whatsapp:${sessao.sub}`, 10, 15 * 60 * 1000))) return resposta({ erro: "Muitas tentativas. Espere alguns minutos." }, 429);

  const pedido = lerPedidoCadastro(await req.json().catch(() => null));
  if (!pedido) return resposta({ erro: "A janela da Meta não devolveu o que era preciso. Tente de novo." }, 400);

  const app = await appMeta();
  if (!app?.configIdWhatsapp) return resposta({ erro: "O cadastro do WhatsApp não está configurado." }, 503);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  try {
    const r = await ligarWhatsapp({ id: sessao.sub, email: sessao.email }, app, pedido);
    await registrar({
      tipo: "meta_conectada",
      email: sessao.email,
      ip,
      detalhe: `WhatsApp pelo cadastro incorporado: ${r.numero ?? r.nomeDaConta}${r.inscrito ? "" : " (avisos não inscritos)"}`,
      autor: sessao.email,
    });
    return resposta({ ok: true, ...r });
  } catch (e) {
    console.error("[meta] cadastro do WhatsApp", e);
    await registrar({ tipo: "meta_falhou", email: sessao.email, ip, detalhe: `cadastro do WhatsApp: ${e instanceof Error ? e.message : String(e)}` });
    return resposta({ erro: "A Meta não confirmou o cadastro. Tente de novo; se repetir, fale com a equipe." }, 502);
  }
}
