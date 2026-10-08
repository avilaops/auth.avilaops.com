import { NextRequest, NextResponse } from "next/server";
import { identificarAutor } from "@/lib/autorMfa";
import { qrSvg } from "@/lib/qr";
import { limitar } from "@/lib/rateLimit";
import { mfaDisponivel, obterOuIniciarCadastro } from "@/lib/segundoFator";

export const runtime = "nodejs";

/**
 * Entrega o QR do cadastro (e o segredo por extenso, para quem digita à mão).
 *
 * O segredo sai em claro nesta resposta — é o único jeito de ele chegar ao
 * aplicativo autenticador. Por isso a rota exige desafio de login ou sessão, e
 * só devolve o segredo de quem pediu: nunca aceita e-mail como parâmetro.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  const autor = await identificarAutor();
  if (!autor) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });

  if (!mfaDisponivel()) {
    return NextResponse.json(
      { erro: "A verificação em duas etapas está indisponível: falta AUTH_ENCRYPTION_KEY no servidor." },
      { status: 503 },
    );
  }
  if (!(await limitar(`mfa-iniciar:${ip}`, 20, 15 * 60 * 1000))) {
    return NextResponse.json({ erro: "Muitas tentativas. Tente novamente em alguns minutos." }, { status: 429 });
  }

  try {
    const { legivel, uri } = await obterOuIniciarCadastro(autor.email);
    return NextResponse.json({ ok: true, email: autor.email, segredo: legivel, uri, svg: qrSvg(uri) });
  } catch (erro) {
    return NextResponse.json({ erro: erro instanceof Error ? erro.message : "Falha ao iniciar o cadastro." }, { status: 400 });
  }
}
