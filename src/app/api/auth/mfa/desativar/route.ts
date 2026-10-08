import { NextRequest, NextResponse } from "next/server";
import { registrar } from "@/lib/eventos";
import { limitar } from "@/lib/rateLimit";
import { desativar, exigeSegundoFator, verificar } from "@/lib/segundoFator";
import { gravarCookieSessao, lerSessao } from "@/lib/sessao";

export const runtime = "nodejs";

/**
 * Desliga o segundo fator, ou começa a troca de aparelho.
 *
 * Exige um código válido **agora**, e não só a sessão: sessão roubada num
 * computador aberto poderia desligar o fator em dois cliques, e o fator existe
 * justamente para o caso de a primeira credencial ter vazado.
 *
 * Quem é obrigado a ter fator (equipe) não desliga — troca de aparelho. Sem
 * isso a obrigação vira sugestão: bastava desligar depois de entrar. Celular
 * perdido sem código de recuperação é caso de reset pelo painel, com rastro em
 * `eventos`.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  const sessao = await lerSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401 });

  if (!(await limitar(`mfa:${sessao.email}`, 8, 15 * 60 * 1000))) {
    return NextResponse.json({ erro: "Muitas tentativas. Tente novamente em alguns minutos." }, { status: 429 });
  }

  let corpo: { codigo?: unknown; trocar?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }
  const codigo = typeof corpo.codigo === "string" ? corpo.codigo : "";
  const trocar = corpo.trocar === true;

  if (!trocar && exigeSegundoFator({ papel: sessao.papel })) {
    return NextResponse.json(
      { erro: "Contas da equipe Avila Ops precisam de verificação em duas etapas. Use “trocar de aparelho”." },
      { status: 403 },
    );
  }

  const r = await verificar(sessao.email, codigo);
  if (!r.ok) {
    await registrar({ tipo: "mfa_falhou", email: sessao.email, ip, detalhe: trocar ? "troca de aparelho" : "desativação" });
    return NextResponse.json(
      { erro: r.motivo === "sem_fator" ? "Esta conta não tem verificação em duas etapas." : "Código incorreto." },
      { status: r.motivo === "sem_fator" ? 409 : 401 },
    );
  }

  await desativar(sessao.email);
  await registrar({
    tipo: "mfa_desativado",
    email: sessao.email,
    ip,
    autor: sessao.email,
    detalhe: trocar ? "troca de aparelho" : "pelo próprio",
  });

  // A sessão deixa de valer como "com segundo fator": app que exige o fator
  // volta a pedir elevação na hora, sem esperar o cookie expirar.
  await gravarCookieSessao({ ...sessao, mfa: false });

  return NextResponse.json({ ok: true, trocar });
}
