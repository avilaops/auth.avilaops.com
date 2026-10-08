import { NextRequest, NextResponse } from "next/server";
import { identificarAutor } from "@/lib/autorMfa";
import { limparCookieDesafio } from "@/lib/desafio";
import { abrirSessao } from "@/lib/entrada";
import { registrar } from "@/lib/eventos";
import { limitar } from "@/lib/rateLimit";
import { confirmarCadastro } from "@/lib/segundoFator";
import { gravarCookieSessao } from "@/lib/sessao";

export const runtime = "nodejs";

/**
 * Confirma o cadastro com um código do aplicativo e devolve os códigos de
 * recuperação — a única vez em que eles existem em claro.
 *
 * Vem do login parado no desafio: a sessão nasce aqui, já com o fator
 * conferido. Vem de `/conta`: a sessão que existe é reescrita com o fator
 * marcado, para não pedir elevação logo em seguida.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  const autor = await identificarAutor();
  if (!autor) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });

  if (!(await limitar(`mfa:${autor.email}`, 10, 15 * 60 * 1000))) {
    return NextResponse.json({ erro: "Muitas tentativas. Tente novamente em alguns minutos." }, { status: 429 });
  }

  let corpo: { codigo?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }
  const codigo = typeof corpo.codigo === "string" ? corpo.codigo : "";

  const r = await confirmarCadastro(autor.email, codigo);
  if (!r.ok) {
    await registrar({ tipo: "mfa_falhou", email: autor.email, ip, detalhe: "cadastro" });
    return NextResponse.json({ erro: r.erro }, { status: 400 });
  }

  await registrar({ tipo: "mfa_ativado", email: autor.email, ip, autor: autor.email });

  if (autor.origem === "desafio") {
    const destino = await abrirSessao(autor.desafio, { ip, mfa: true, detalhe: "2FA recém-ativado" });
    await limparCookieDesafio();
    return NextResponse.json({ ok: true, codigos: r.codigos, destino });
  }

  // Já logado: a sessão passa a valer como "com segundo fator".
  await gravarCookieSessao({ ...autor.sessao, mfa: true });
  return NextResponse.json({ ok: true, codigos: r.codigos, destino: null });
}
