import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { autenticarRotinaMeta } from "@/lib/renovacaoMeta";
import { executarRotinaMeta } from "@/lib/rotinaMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** O mesmo segredo já usado entre Auth e seus workflows, nunca o cookie SSO. */
export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  const responder = (corpo: object, status = 200) => NextResponse.json({ ...corpo, requestId }, {
    status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
  if (!autenticarRotinaMeta(req.headers.get("x-avila-webhook-token"), process.env.N8N_CAIXA_WEBHOOK_TOKEN)) {
    return responder({ error: "Credencial inválida." }, 401);
  }
  const cursor = req.nextUrl.searchParams.get("cursor") || null;
  if (cursor && !/^[0-9a-f-]{36}$/i.test(cursor)) return responder({ error: "Cursor inválido." }, 400);
  const inicio = Date.now();
  try {
    const resumo = await executarRotinaMeta(cursor);
    if (!resumo) return responder({ error: "Conexão Meta indisponível." }, 503);
    console.info("[meta] rotina diária", { requestId, ...resumo, duracaoMs: Date.now() - inicio });
    return responder({ ok: resumo.falhas === 0, ...resumo });
  } catch {
    console.error("[meta] rotina diária indisponível", { requestId });
    return responder({ error: "Rotina indisponível. Tente novamente." }, 503);
  }
}
