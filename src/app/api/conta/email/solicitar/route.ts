import { NextRequest, NextResponse } from "next/server";
import { lerContaAutenticada } from "@/lib/contaAutenticada";
import { solicitarConfirmacaoEmail } from "@/lib/confirmacaoEmail";
import { emailConfigurado, enviarEmail } from "@/lib/email";
import { emailDeConfirmacaoDaConta } from "@/lib/emailConfirmacao";
import { registrar } from "@/lib/eventos";
import { origemLocalDoLogout } from "@/lib/pedidoLogout";

export const runtime = "nodejs";
const resposta = (corpo: object, status = 200, extras: Record<string, string> = {}) => NextResponse.json(corpo, {
  status, headers: { "Cache-Control": "no-store", ...extras },
});

export async function POST(req: NextRequest) {
  if (!origemLocalDoLogout(req.headers.get("origin"))) return resposta({ erro: "Origem não autorizada." }, 403);
  try {
    const atual = await lerContaAutenticada();
    if (atual.tipo !== "autenticada") return resposta({ erro: "Entre novamente para confirmar seu e-mail." }, 401);
    if (!emailConfigurado()) return resposta({ erro: "O envio de confirmação não está disponível neste ambiente." }, 503);
    const pedido = await solicitarConfirmacaoEmail(atual.conta.id, atual.conta.email);
    if (pedido.tipo === "invalida") return resposta({ erro: "Entre novamente para conferir o endereço atual." }, 401);
    if (pedido.tipo === "confirmada") return resposta({ confirmado: true, mensagem: "Seu e-mail já está confirmado." });
    if (pedido.tipo === "aguardar") return resposta({ erro: `Aguarde ${pedido.repetirEm} segundos antes de pedir outro link.` }, 429, { "Retry-After": String(pedido.repetirEm) });
    if (pedido.tipo !== "enviar") return resposta({ erro: "Não foi possível emitir o link." }, 503);
    await enviarEmail({ para: pedido.email, ...emailDeConfirmacaoDaConta(pedido.nome, pedido.token) });
    await registrar({ tipo: "email_confirmacao_enviada", email: pedido.email, autor: pedido.email });
    return resposta({ mensagem: "Enviamos o link para o e-mail da sua conta. Ele vale por 30 minutos. Confira também a caixa de spam." }, 202);
  } catch {
    // Nunca registrar link, corpo da mensagem, credenciais ou detalhes do driver.
    return resposta({ erro: "Não foi possível enviar o link agora. Tente novamente em alguns minutos." }, 502);
  }
}
