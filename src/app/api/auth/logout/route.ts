import { after, NextRequest, NextResponse } from "next/server";
import { avisarLogout } from "@/lib/avisoDeLogout";
import { registrar } from "@/lib/eventos";
import { destinoDoLogout, lerPedidoLogout, origemLocalDoLogout, PedidoLogoutInvalido } from "@/lib/pedidoLogout";
import { revogarRefreshDaConta } from "@/lib/refreshOAuth";
import { lerSessao, limparCookieSessao } from "@/lib/sessao";
import { urlAbsoluta } from "@/lib/urls";

export const runtime = "nodejs";

/**
 * Logout global: apaga o cookie de `.avilaops.com`, então derruba a sessão em
 * todos os subdomínios de uma vez.
 *
 * GET e POST de fora do serviço pedem confirmação. Só o POST originado no
 * Auth/Conta pode encerrar a sessão, depois de validar o destino novamente.
 */
async function encerrar(destino: string) {
  const sessao = await lerSessao();
  await limparCookieSessao();
  if (sessao) {
    // Sair vale para os sistemas que entram por OIDC também: sem isto, o
    // refresh token deles renovaria a sessão de quem acabou de sair.
    await revogarRefreshDaConta(sessao.sub);
    // Depois de responder: a pessoa não espera os outros sistemas para sair.
    const sub = sessao.sub;
    after(() => avisarLogout(sub));
    await registrar({ tipo: "logout", email: sessao.email });
  }

  return redirecionar(destino);
}

function redirecionar(destino: string) {
  const res = NextResponse.redirect(destino, { status: 303 });
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

async function atender(req: NextRequest) {
  try {
    const pedido = await lerPedidoLogout(req);
    if (req.method !== "POST" || !origemLocalDoLogout(req.headers.get("origin"))) {
      return redirecionar(urlAbsoluta(`/sair${pedido.size ? `?${pedido}` : ""}`));
    }
    return await encerrar(await destinoDoLogout(pedido));
  } catch (e) {
    if (!(e instanceof PedidoLogoutInvalido)) throw e;
    return NextResponse.json({ error: "invalid_request", error_description: e.message }, {
      status: 400, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  }
}

export const GET = atender;
export const POST = atender;
