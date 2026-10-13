import { NextResponse, type NextRequest } from "next/server";
import { registrar } from "@/lib/eventos";
import { apagarCanal, atualizarCanal, canalDoCliente, canalParaOReceptor, criarCanal, enviarVerificacao, validarCanal } from "@/lib/ssf";
import { corpoJson, erroSsf, exigirSsf, semCache } from "@/lib/ssfAcesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Configuração do canal de sinais (stream) da integração que chama.
 *
 * Um canal por integração. O `stream_id` é aceito onde a especificação o pede,
 * mas quem decide de qual canal se trata é o token: uma integração nunca lê
 * nem altera o canal de outra, mesmo sabendo o identificador.
 */
export async function POST(req: NextRequest) {
  const cliente = await exigirSsf(req, true);
  if (cliente instanceof NextResponse) return cliente;

  const v = validarCanal(await corpoJson(req));
  if (!v.ok) return erroSsf(400, v.erro);

  const canal = await criarCanal(cliente.id, v.dados);
  if (!canal) return semCache(NextResponse.json({ err: "conflict", description: "Esta integração já tem um canal." }, { status: 409 }));

  await registrar({ tipo: "ssf_canal_criado", appId: cliente.appId, autor: `app:${cliente.id}`, detalhe: `${cliente.id} → ${new URL(canal.endpointUrl).host}` });
  // O receptor costuma conferir o canal logo depois de criá-lo: já sai um evento de verificação.
  void enviarVerificacao(canal);
  return semCache(NextResponse.json(canalParaOReceptor(canal), { status: 201 }));
}

export async function GET(req: NextRequest) {
  const cliente = await exigirSsf(req, false);
  if (cliente instanceof NextResponse) return cliente;

  const canal = await canalDoCliente(cliente.id);
  const pedido = req.nextUrl.searchParams.get("stream_id");
  // Sem `stream_id` a resposta é a lista, vazia quando não há canal.
  if (!pedido) return semCache(NextResponse.json(canal ? [canalParaOReceptor(canal)] : []));
  if (!canal || canal.id !== pedido) return erroSsf(404, "Canal não encontrado.");
  return semCache(NextResponse.json(canalParaOReceptor(canal)));
}

/** `PUT` substitui tudo; `PATCH` muda só o que veio. */
async function alterar(req: NextRequest, substituir: boolean) {
  const cliente = await exigirSsf(req, true);
  if (cliente instanceof NextResponse) return cliente;

  const corpo = await corpoJson(req);
  const canal = await canalDoCliente(cliente.id);
  const pedido = typeof (corpo as { stream_id?: unknown } | null)?.stream_id === "string" ? (corpo as { stream_id: string }).stream_id : null;
  if (!pedido) return erroSsf(400, "`stream_id` ausente.");
  if (!canal || canal.id !== pedido) return erroSsf(404, "Canal não encontrado.");

  const c = (corpo ?? {}) as { delivery?: unknown; events_requested?: unknown; description?: unknown };
  // Para validar com a mesma regra da criação, o que não veio no PATCH é completado com o que já existe.
  const completo = {
    delivery: c.delivery ?? (substituir ? undefined : { method: "urn:ietf:rfc:8935", endpoint_url: canal.endpointUrl }),
    events_requested: c.events_requested ?? (substituir ? [] : JSON.parse(canal.eventosPedidos)),
    description: c.description ?? (substituir ? undefined : (canal.descricao ?? undefined)),
  };
  const v = validarCanal(completo);
  if (!v.ok) return erroSsf(400, v.erro);

  const novo = await atualizarCanal(canal.id, {
    endpointUrl: v.dados.endpointUrl,
    eventosPedidos: v.dados.eventosPedidos,
    descricao: v.dados.descricao,
    // O cabeçalho de autorização só muda quando o receptor manda `delivery` de novo.
    ...(c.delivery !== undefined ? { autorizacao: v.dados.autorizacao } : {}),
  });
  await registrar({ tipo: "ssf_canal_alterado", appId: cliente.appId, autor: `app:${cliente.id}`, detalhe: `${cliente.id} → ${new URL(novo.endpointUrl).host}` });
  return semCache(NextResponse.json(canalParaOReceptor(novo)));
}

export async function PATCH(req: NextRequest) {
  return alterar(req, false);
}

export async function PUT(req: NextRequest) {
  return alterar(req, true);
}

export async function DELETE(req: NextRequest) {
  const cliente = await exigirSsf(req, true);
  if (cliente instanceof NextResponse) return cliente;

  const canal = await canalDoCliente(cliente.id);
  const pedido = req.nextUrl.searchParams.get("stream_id");
  if (!canal || (pedido && canal.id !== pedido)) return erroSsf(404, "Canal não encontrado.");

  await apagarCanal(canal.id);
  await registrar({ tipo: "ssf_canal_removido", appId: cliente.appId, autor: `app:${cliente.id}`, detalhe: cliente.id });
  return semCache(new NextResponse(null, { status: 204 }));
}
