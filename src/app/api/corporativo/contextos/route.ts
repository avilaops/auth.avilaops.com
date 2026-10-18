import { NextRequest, NextResponse } from "next/server";
import { buscarConta } from "@/lib/contas";
import { CONTRATO_CORPORATIVO, listarContextosCorporativos } from "@/lib/corporativo";
import { buscarCliente, ESCOPO_CONTEXTO_CORPORATIVO, verificarAccessToken } from "@/lib/oidc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resposta(corpo: object, status = 200) {
  return NextResponse.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const cabecalho = req.headers.get("authorization");
  const token = cabecalho?.startsWith("Bearer ") ? cabecalho.slice(7) : "";
  const identidade = token ? verificarAccessToken(token) : null;
  if (!identidade?.aud) return resposta({ error: "Token inválido." }, 401);
  if (!identidade.escopos.includes(ESCOPO_CONTEXTO_CORPORATIVO)) {
    return resposta({ error: `O token não possui o escopo ${ESCOPO_CONTEXTO_CORPORATIVO}.` }, 403);
  }

  // A integração é conferida a cada leitura. Desativá-la no Auth interrompe
  // imediatamente a consulta, mesmo que o access token ainda não tenha vencido.
  if (!(await buscarCliente(identidade.aud))) return resposta({ error: "Integração desativada ou inexistente." }, 401);
  const conta = await buscarConta(identidade.sub);
  if (!conta?.ativa) return resposta({ error: "Conta desativada ou inexistente." }, 401);

  const contextos = await listarContextosCorporativos(identidade.sub, identidade.aud);
  return resposta({ contrato: CONTRATO_CORPORATIVO, contextos });
}
