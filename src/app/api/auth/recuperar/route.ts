import { NextRequest, NextResponse } from "next/server";
import { destinoInicial } from "@/lib/admin";
import { returnToSeguro } from "@/lib/apps";
import { buscarApp } from "@/lib/cadastro";
import { buscarContaPorEmail, definirSenha, papelDaRole } from "@/lib/contas";
import { entrar } from "@/lib/entrada";
import { registrar } from "@/lib/eventos";
import { podeEntrar } from "@/lib/permissoes";
import { limitar } from "@/lib/rateLimit";
import { consumirTokenRecuperacao } from "@/lib/recuperacao";

export const runtime = "nodejs";

/** Define senha nova a partir de um link de recuperação e já loga. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  if (!(await limitar(`recuperar:${ip}`, 10, 15 * 60 * 1000))) {
    return NextResponse.json({ erro: "Muitas tentativas." }, { status: 429 });
  }

  let corpo: { token?: unknown; nova?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }
  const token = typeof corpo.token === "string" ? corpo.token : "";
  const nova = typeof corpo.nova === "string" ? corpo.nova : "";
  if (nova.length < 8) {
    return NextResponse.json({ erro: "A senha precisa ter ao menos 8 caracteres." }, { status: 400 });
  }

  const link = await consumirTokenRecuperacao(token);
  if (!link) return NextResponse.json({ erro: "Link inválido ou expirado." }, { status: 400 });

  const conta = await buscarContaPorEmail(link.email);
  if (!conta) return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });

  await definirSenha(conta.id, nova, false);
  await registrar({ tipo: "recuperacao_usada", email: conta.email, ip, autor: conta.email });

  const papel = papelDaRole(conta.role);

  // Convite de um sistema: a pessoa cai nele, não na própria conta daqui. A
  // liberação é conferida agora, não na emissão: pode ter sido tirada no meio.
  const convidou = link.appId ? await buscarApp(link.appId) : null;
  const app = convidou && (await podeEntrar(conta.email, papel, convidou)) ? convidou : null;

  // Link de recuperação prova acesso ao e-mail, não posse do celular. Sem
  // passar pelo `entrar`, ele seria o atalho que contorna o segundo fator: bastaria
  // pedir um link ao suporte para entrar sem o aplicativo.
  const entrada = await entrar(
    {
      sub: conta.id,
      email: conta.email,
      nome: conta.nome,
      foto: null,
      papel,
      destino: app ? returnToSeguro(link.destino, app) : destinoInicial({ email: conta.email, papel }),
      app,
      senhaProvisoria: false,
      via: "via recuperação",
    },
    ip,
  );

  return NextResponse.json({ ok: true, destino: entrada.destino });
}
