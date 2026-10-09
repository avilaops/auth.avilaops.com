import { NextRequest, NextResponse } from "next/server";
import { emailAceito, emailDeConfirmacao, emailDeContaExistente, linkDeConfirmacao, nomeAceito, normalizarEmail, tokenDeCadastro } from "@/lib/cadastroProprio";
import { buscarApp } from "@/lib/cadastro";
import { buscarContaPorEmail } from "@/lib/contas";
import { emailConfigurado, enviarEmail } from "@/lib/email";
import { limitar } from "@/lib/rateLimit";
import { emitirLinkRecuperacao } from "@/lib/recuperacao";

export const runtime = "nodejs";

const RESPOSTA = { ok: true, mensagem: "Se o endereço puder receber e-mail, o link de confirmação chega em instantes. Confira também a caixa de spam." };

/**
 * Primeiro passo do cadastro próprio: recebe nome e e-mail e manda o link.
 *
 * A resposta é a mesma quer o e-mail já tenha conta, quer não: responder
 * "este e-mail já está cadastrado" entregaria de graça a lista de quem tem
 * conta. Quem já tem recebe, no lugar da confirmação, um link para definir uma
 * senha nova.
 *
 * Nada é gravado aqui além do contador de tentativas. A conta só nasce quando
 * a pessoa abre o link e escolhe a senha.
 */
export async function POST(req: NextRequest) {
  if (!emailConfigurado()) {
    return NextResponse.json({ erro: "A criação de conta por e-mail não está disponível agora. Entre com Google, Microsoft ou Facebook, ou fale com a equipe Ávila Ops." }, { status: 503 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  if (!(await limitar(`criar:${ip}`, 8, 60 * 60 * 1000))) {
    return NextResponse.json({ erro: "Muitas tentativas. Tente de novo mais tarde." }, { status: 429 });
  }

  let corpo: { nome?: unknown; email?: unknown; app?: unknown; returnTo?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }
  const nome = typeof corpo.nome === "string" ? corpo.nome.trim() : "";
  const email = typeof corpo.email === "string" ? normalizarEmail(corpo.email) : "";
  if (!nomeAceito(nome)) return NextResponse.json({ erro: "Informe seu nome." }, { status: 400 });
  if (!emailAceito(email)) return NextResponse.json({ erro: "Informe um e-mail válido." }, { status: 400 });

  // Um endereço não recebe mais de três e-mails por hora, peça quem pedir.
  if (!(await limitar(`criar-email:${email}`, 3, 60 * 60 * 1000))) return NextResponse.json(RESPOSTA);

  // O destino viaja no link só como texto: quem o valida é a tela de login,
  // depois, com a sessão aberta. Aplicação desconhecida é descartada já aqui.
  const app = typeof corpo.app === "string" ? await buscarApp(corpo.app) : null;
  const returnTo = typeof corpo.returnTo === "string" && corpo.returnTo.length <= 2000 ? corpo.returnTo : null;

  try {
    if (await buscarContaPorEmail(email)) {
      await enviarEmail({ para: email, ...emailDeContaExistente(await emitirLinkRecuperacao(email)) });
    } else {
      const token = tokenDeCadastro({ email, nome, app: app?.id ?? null, returnTo });
      await enviarEmail({ para: email, ...emailDeConfirmacao(nome, linkDeConfirmacao(token)) });
    }
  } catch (erro) {
    // O motivo fica no log do servidor, sem o endereço; a pessoa recebe uma frase que dá para agir.
    console.error("[cadastro] e-mail não enviado:", erro instanceof Error ? erro.message : erro);
    return NextResponse.json({ erro: "Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos." }, { status: 502 });
  }
  return NextResponse.json(RESPOSTA);
}
