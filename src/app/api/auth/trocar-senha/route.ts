import { NextRequest, NextResponse } from "next/server";
import { autenticar, definirSenha } from "@/lib/contas";
import { registrar } from "@/lib/eventos";
import { lerSessao } from "@/lib/sessao";

export const runtime = "nodejs";

const SENHA_MINIMA = 8;

/** Troca de senha do próprio usuário logado. Exige a senha atual. */
export async function POST(req: NextRequest) {
  const sessao = await lerSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });

  let corpo: { atual?: unknown; nova?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }
  const atual = typeof corpo.atual === "string" ? corpo.atual : "";
  const nova = typeof corpo.nova === "string" ? corpo.nova : "";

  if (nova.length < SENHA_MINIMA) {
    return NextResponse.json({ erro: `A nova senha precisa ter ao menos ${SENHA_MINIMA} caracteres.` }, { status: 400 });
  }
  const conta = await autenticar(sessao.email, atual);
  if (!conta) return NextResponse.json({ erro: "Senha atual incorreta." }, { status: 401 });

  await definirSenha(conta.id, nova, false);
  await registrar({ tipo: "senha_trocada", email: conta.email, autor: conta.email });
  return NextResponse.json({ ok: true });
}
