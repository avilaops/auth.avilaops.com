import { NextRequest, NextResponse } from "next/server";
import { lerDesafio, limparCookieDesafio } from "@/lib/desafio";
import { abrirSessao } from "@/lib/entrada";
import { registrar } from "@/lib/eventos";
import { limitar, liberar } from "@/lib/rateLimit";
import { verificar } from "@/lib/segundoFator";

export const runtime = "nodejs";

/**
 * O desafio do login: seis dígitos do aplicativo, ou um código de recuperação.
 *
 * O limite de tentativas é o que sustenta o fator. Seis dígitos com tolerância
 * de um intervalo para cada lado são 3 em 1.000.000 por tentativa; sem trava,
 * um laço acerta em horas. Estourado o limite, o desafio é **descartado** e a
 * pessoa recomeça pela senha — adivinhar o código deixa de ser uma corrida que
 * dá para continuar de onde parou.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  const desafio = await lerDesafio();
  if (!desafio) {
    return NextResponse.json({ erro: "O login expirou. Entre de novo.", recomecar: true }, { status: 401 });
  }
  if (desafio.motivo === "cadastrar") {
    return NextResponse.json({ erro: "Cadastre a verificação em duas etapas primeiro.", destino: "/mfa/cadastrar" }, { status: 400 });
  }

  if (!(await limitar(`mfa:${desafio.email}`, 8, 15 * 60 * 1000)) || !(await limitar(`mfa-ip:${ip}`, 30, 15 * 60 * 1000))) {
    await limparCookieDesafio();
    await registrar({ tipo: "mfa_falhou", email: desafio.email, ip, detalhe: "limite de tentativas" });
    return NextResponse.json(
      { erro: "Muitas tentativas. Entre com a senha de novo para tentar outra vez.", recomecar: true },
      { status: 429 },
    );
  }

  let corpo: { codigo?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }
  const codigo = typeof corpo.codigo === "string" ? corpo.codigo : "";

  const r = await verificar(desafio.email, codigo);
  if (!r.ok) {
    if (r.motivo === "sem_fator") {
      // Fator removido no meio do caminho (reset do admin, por exemplo).
      await limparCookieDesafio();
      return NextResponse.json({ erro: "Esta conta não tem mais verificação em duas etapas. Entre de novo.", recomecar: true }, { status: 409 });
    }
    await registrar({ tipo: "mfa_falhou", email: desafio.email, appId: desafio.appId, ip, detalhe: desafio.via });
    return NextResponse.json({ erro: "Código incorreto." }, { status: 401 });
  }

  await liberar(`mfa:${desafio.email}`);
  await registrar({
    tipo: r.via === "backup" ? "mfa_backup_usado" : "mfa_ok",
    email: desafio.email,
    appId: desafio.appId,
    ip,
    detalhe: r.via === "backup" ? `restam ${r.codigosRestantes} códigos de recuperação` : desafio.via,
  });

  const destino = await abrirSessao(desafio, { ip, mfa: true, detalhe: r.via === "backup" ? "código de recuperação" : undefined });
  await limparCookieDesafio();

  return NextResponse.json({ ok: true, destino, via: r.via, codigosRestantes: r.codigosRestantes });
}
