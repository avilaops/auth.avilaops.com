import { NextRequest, NextResponse } from "next/server";
import { registrar } from "@/lib/eventos";
import { limitar } from "@/lib/rateLimit";
import { regenerarCodigos, verificar } from "@/lib/segundoFator";
import { lerSessao } from "@/lib/sessao";

export const runtime = "nodejs";

/**
 * Gera códigos de recuperação novos. Os antigos param de valer no mesmo
 * instante — é o que resolve "imprimi a lista e não sei onde deixei".
 *
 * Exige um código válido agora, pelo mesmo motivo da desativação: quem chegou
 * a uma sessão aberta não pode sair com dez chaves reservas no bolso.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  const sessao = await lerSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });

  if (!(await limitar(`mfa:${sessao.email}`, 8, 15 * 60 * 1000))) {
    return NextResponse.json({ erro: "Muitas tentativas. Tente novamente em alguns minutos." }, { status: 429 });
  }

  let corpo: { codigo?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }

  const r = await verificar(sessao.email, typeof corpo.codigo === "string" ? corpo.codigo : "");
  if (!r.ok) {
    await registrar({ tipo: "mfa_falhou", email: sessao.email, ip, detalhe: "novos códigos de recuperação" });
    return NextResponse.json(
      { erro: r.motivo === "sem_fator" ? "Esta conta não tem verificação em duas etapas." : "Código incorreto." },
      { status: r.motivo === "sem_fator" ? 409 : 401 },
    );
  }

  const codigos = await regenerarCodigos(sessao.email);
  await registrar({ tipo: "mfa_codigos_gerados", email: sessao.email, ip, autor: sessao.email });
  return NextResponse.json({ ok: true, codigos });
}
