import { NextRequest, NextResponse } from "next/server";
import { resgatarCodigo } from "@/lib/codigoTroca";
import { prisma } from "@/lib/prisma";
import { assinarSessao } from "@/lib/sessao";

export const runtime = "nodejs";

/**
 * Troca o código de uso único por um token de sessão.
 *
 * Usado pelo app nativo, que recebe o código pelo deep link e o converte aqui.
 * O token vai no corpo da resposta, não em cookie nem na URL — URL fica em
 * histórico e em log de servidor.
 */
export async function POST(req: NextRequest) {
  let corpo: { code?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const code = typeof corpo.code === "string" ? corpo.code : null;
  if (!code) return NextResponse.json({ erro: "code ausente" }, { status: 400 });

  const resgate = await resgatarCodigo(code);
  // Mesma resposta para código inexistente, expirado e já usado: distinguir os
  // casos entregaria um oráculo para quem estiver sondando códigos.
  if (!resgate) return NextResponse.json({ erro: "código inválido" }, { status: 401 });

  const usuario = await prisma.usuario.findUnique({ where: { id: resgate.usuarioId } });
  if (!usuario) return NextResponse.json({ erro: "código inválido" }, { status: 401 });

  return NextResponse.json({
    token: assinarSessao({
      sub: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      foto: usuario.foto,
      papel: resgate.papel,
    }),
  });
}
