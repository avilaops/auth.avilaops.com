import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { autenticarRotinaMeta } from "@/lib/renovacaoMeta";
import { continuarRotinaMeta, executarRotinaMeta } from "@/lib/rotinaMeta";

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
  const continuar = req.nextUrl.searchParams.get("continuar");
  if (continuar !== null && continuar !== "1") return responder({ error: "Modo inválido." }, 400);
  if (continuar && cursor) return responder({ error: "O modo contínuo usa o cursor salvo no servidor." }, 400);
  if (cursor && !/^[0-9a-f-]{36}$/i.test(cursor)) return responder({ error: "Cursor inválido." }, 400);
  const inicio = Date.now();
  try {
    const resumo = continuar ? await continuarRotinaMeta() : await executarRotinaMeta(cursor);
    if (!resumo) return responder({ error: "Conexão Meta indisponível." }, 503);
    console.info("[meta] rotina diária", { requestId, ...resumo, duracaoMs: Date.now() - inicio });
    return responder({ ok: resumo.falhas === 0, ...resumo });
  } catch {
    console.error("[meta] rotina diária indisponível", { requestId });
    return responder({ error: "Rotina indisponível. Tente novamente." }, 503);
  }
}
