import { NextRequest, NextResponse } from "next/server";
import { ehSuperadmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { diagnosticar } from "@/lib/segundoFator";
import { lerSessao } from "@/lib/sessao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Saúde do serviço — e o que o healthcheck antigo não via.
 *
 * O compose perguntava por `/login` **anônimo**. Em 19/09 isso ficou verde
 * durante toda uma queda: o trecho que explodia só rodava com cookie de
 * sessão, então o container parecia são enquanto a equipe recebia "a server
 * error occurred" e não conseguia entrar. Healthcheck que só sabe responder
 * sobre quem não está logado não é healthcheck do login.
 *
 * ## O que é falha e o que é aviso
 *
 * - **503**: o banco do `auth` não responde. Aí o login realmente não acontece
 *   para ninguém, e derrubar o container para subir outro é a resposta certa.
 * - **200 com `degradado`**: o segundo fator está suspenso (falta a chave de
 *   cifra ou a migração). O serviço funciona, logo reiniciar não resolveria
 *   nada — o que falta é alguém saber. Por isso vira aviso, não morte.
 *
 * ## Por que o corpo público é curto
 *
 * Sem sessão de admin, a resposta diz apenas se está de pé e se está
 * degradado. O detalhe — qual metade falta — é exatamente o que um atacante
 * usaria para escolher a hora de tentar: saber que o segundo fator está
 * suspenso vale um ataque de senha. Esse detalhe sai só para quem abre o
 * painel.
 */
export async function GET(_req: NextRequest) {
  const inicio = Date.now();

  let banco = true;
  try {
    await prisma.$queryRaw`select 1`;
  } catch (erro) {
    console.error("[saude] banco do auth não respondeu", erro);
    banco = false;
  }

  if (!banco) {
    return NextResponse.json(
      { ok: false, degradado: true, motivo: "banco" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const fator = await diagnosticar();
  const sessao = await lerSessao();
  const detalhado = ehSuperadmin(sessao);

  return NextResponse.json(
    {
      ok: true,
      degradado: !fator.disponivel,
      ...(detalhado
        ? {
            detalhe: {
              banco: "ok",
              segundoFator: fator.disponivel ? "ativo" : "suspenso",
              chaveDeCifra: fator.chave ? "presente" : "ausente",
              migracoes: fator.migracoes,
              msDeResposta: Date.now() - inicio,
            },
          }
        : {}),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
