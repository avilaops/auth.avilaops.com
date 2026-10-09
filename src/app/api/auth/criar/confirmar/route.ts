import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { destinoDepoisDoCadastro, lerTokenDeCadastro } from "@/lib/cadastroProprio";
import { buscarContaPorEmail, criarConta, definirSenha, papelDaRole } from "@/lib/contas";
import { entrar } from "@/lib/entrada";
import { registrar } from "@/lib/eventos";
import { limitar } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * Segundo passo do cadastro próprio: o link confirmou o e-mail, a pessoa
 * escolheu a senha, a conta nasce e a sessão abre.
 *
 * A conta é sempre de cliente (`CLIENT`), sem empresa e sem liberação. Quem
 * abre a sessão é `entrar()`, como em todo outro caminho de login.
 *
 * O link pode ser aberto mais de uma vez, mas só cria a conta uma: na segunda,
 * o e-mail já tem conta e a resposta manda a pessoa entrar. Isso também cobre
 * quem criou a conta por login social entre pedir o link e abri-lo.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  if (!(await limitar(`criar-confirmar:${ip}`, 10, 15 * 60 * 1000))) {
    return NextResponse.json({ erro: "Muitas tentativas." }, { status: 429 });
  }

  let corpo: { token?: unknown; nova?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }
  const pedido = typeof corpo.token === "string" ? lerTokenDeCadastro(corpo.token) : null;
  if (!pedido) return NextResponse.json({ erro: "Link inválido ou vencido. Peça um novo em Criar conta." }, { status: 400 });
  const nova = typeof corpo.nova === "string" ? corpo.nova : "";
  if (nova.length < 8) return NextResponse.json({ erro: "A senha precisa ter ao menos 8 caracteres." }, { status: 400 });

  if (await buscarContaPorEmail(pedido.email)) {
    return NextResponse.json({ erro: "Este e-mail já tem conta. Entre com a sua senha." }, { status: 409 });
  }

  let conta;
  try {
    ({ conta } = await criarConta({ nome: pedido.nome, email: pedido.email, role: "CLIENT" }));
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "";
    // Dois cliques ao mesmo tempo: o segundo bate na chave única.
    if (mensagem.includes("unique") || mensagem.includes("duplicate")) {
      return NextResponse.json({ erro: "Este e-mail já tem conta. Entre com a sua senha." }, { status: 409 });
    }
    throw erro;
  }
  // `criarConta` gera uma senha provisória; a que vale é a que a pessoa escolheu.
  // Se a gravação falhar, a provisória aleatória fica e ninguém a conhece.
  await definirSenha(conta.id, nova, false).catch(async (erro) => {
    await definirSenha(conta.id, randomBytes(24).toString("base64url"), false).catch(() => {});
    throw erro;
  });
  await registrar({ tipo: "conta_criada", email: conta.email, appId: pedido.app, ip, detalhe: "cadastro próprio, e-mail confirmado", autor: conta.email });

  const entrada = await entrar(
    {
      sub: conta.id,
      email: conta.email,
      nome: conta.nome,
      foto: null,
      papel: papelDaRole(conta.role),
      destino: destinoDepoisDoCadastro(pedido),
      app: null,
      senhaProvisoria: false,
      via: "cadastro próprio",
    },
    ip,
  );
  return NextResponse.json({ ok: true, destino: entrada.destino });
}
