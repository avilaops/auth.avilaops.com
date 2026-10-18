import { NextRequest, NextResponse } from "next/server";
import { buscarContaPorEmail } from "@/lib/contas";
import {
  alterarSituacaoDoVinculo,
  CONTRATO_CORPORATIVO,
  lerPedidoDeProvisionamentoCorporativo,
  provisionarContextoCorporativo,
  type SituacaoCorporativa,
} from "@/lib/corporativo";
import { autenticarCliente, type ClienteOIDC } from "@/lib/oidc";
import { limitar } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resposta(corpo: object, status = 200) {
  return NextResponse.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
}

function emailValido(valor: string | null): string | null {
  const email = valor?.trim().toLowerCase() ?? "";
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function preparar(req: NextRequest): Promise<{ cliente: ClienteOIDC; autor: string } | NextResponse> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  if (!(await limitar(`provisionamento-corporativo:${ip}`, 120, 15 * 60 * 1000))) {
    return resposta({ error: "Muitas chamadas. Tente novamente em alguns minutos." }, 429);
  }
  const autorizacao = req.headers.get("authorization");
  const cliente = autorizacao?.startsWith("Basic ") ? await autenticarCliente(autorizacao) : null;
  return cliente ? { cliente, autor: `app:${cliente.id}` } : resposta({ error: "Cliente ou segredo inválidos." }, 401);
}

export async function POST(req: NextRequest) {
  const autenticacao = await preparar(req);
  if (autenticacao instanceof NextResponse) return autenticacao;
  const pedido = lerPedidoDeProvisionamentoCorporativo(await req.json().catch(() => null));
  if (!pedido) return resposta({ error: `Corpo inválido para o contrato ${CONTRATO_CORPORATIVO}.` }, 400);

  const conta = await buscarContaPorEmail(pedido.email);
  if (!conta?.ativa) {
    return resposta({ error: "A conta não existe ou está desligada. Provisione primeiro em /api/provisionamento/acessos." }, 409);
  }

  const resultado = await provisionarContextoCorporativo({
    clienteId: autenticacao.cliente.id,
    contaId: conta.id,
    contaEmail: conta.email,
    autor: autenticacao.autor,
    referenciaOrganizacao: pedido.referenciaOrganizacao,
    nomeOrganizacao: pedido.nomeOrganizacao,
    convidadoPor: pedido.convidadoPor,
    unidades: pedido.unidades,
    autorizacoes: pedido.autorizacoes,
  });
  return resposta({ contrato: CONTRATO_CORPORATIVO, ...resultado });
}

export async function DELETE(req: NextRequest) {
  const autenticacao = await preparar(req);
  if (autenticacao instanceof NextResponse) return autenticacao;
  const email = emailValido(req.nextUrl.searchParams.get("email"));
  const referenciaOrganizacao = req.nextUrl.searchParams.get("organizacao")?.trim() ?? "";
  const situacao = req.nextUrl.searchParams.get("situacao") as SituacaoCorporativa | null;
  if (!email || !referenciaOrganizacao || (situacao !== "SUSPENSO" && situacao !== "REVOGADO")) {
    return resposta({ error: "Informe email, organizacao e situacao SUSPENSO ou REVOGADO." }, 400);
  }

  const conta = await buscarContaPorEmail(email);
  if (!conta) return resposta({ error: "Vínculo não encontrado." }, 404);
  const alterado = await alterarSituacaoDoVinculo({
    clienteId: autenticacao.cliente.id,
    referenciaOrganizacao,
    contaId: conta.id,
    contaEmail: conta.email,
    situacao,
    autor: autenticacao.autor,
  });
  return alterado
    ? resposta({ contrato: CONTRATO_CORPORATIVO, email, referenciaOrganizacao, situacao })
    : resposta({ error: "Vínculo não encontrado." }, 404);
}
