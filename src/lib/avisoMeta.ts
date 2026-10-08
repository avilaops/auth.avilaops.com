import { NextRequest, NextResponse } from "next/server";
import { apagarPorUsuarioMeta, registrarExclusao } from "@/lib/conexaoMeta";
import { credenciais } from "@/lib/conectores";
import { registrar } from "@/lib/eventos";
import { lerPedidoAssinado } from "@/lib/meta";
import { urlAbsoluta } from "@/lib/urls";

/**
 * Os dois avisos que a Meta manda por conta própria, sem navegador no meio:
 * a pessoa removeu o app ("desautorizar") ou pediu a exclusão dos dados.
 *
 * Fica aqui, e não nos `route.ts`, pelo motivo de `fluxo.ts`: arquivo de rota
 * só pode exportar os handlers.
 *
 * A única prova de que o aviso é da Meta é a assinatura do `signed_request`,
 * feita com o segredo do app. Pedido sem assinatura válida responde 400 e não
 * apaga nada.
 */
export async function tratarAvisoMeta(req: NextRequest, tipo: "exclusao" | "desautorizacao"): Promise<NextResponse> {
  const form = await req.formData().catch(() => null);
  const bruto = form?.get("signed_request");

  const cred = await credenciais("facebook", { mesmoDesligado: true }).catch(() => null);
  const pedido = cred?.clientSecret && typeof bruto === "string" ? lerPedidoAssinado(bruto, cred.clientSecret) : null;
  if (!pedido) return NextResponse.json({ erro: "pedido inválido" }, { status: 400 });

  const emails = await apagarPorUsuarioMeta(pedido.userId, { comLogin: tipo === "exclusao" });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const evento = tipo === "exclusao" ? "meta_dados_excluidos" : "meta_desconectada";
  if (emails.length === 0) await registrar({ tipo: evento, ip, detalhe: "pedido da Meta, nada a apagar", autor: "meta" });
  for (const email of emails) await registrar({ tipo: evento, email, ip, detalhe: "pedido da Meta", autor: "meta" });

  if (tipo === "desautorizacao") return NextResponse.json({ ok: true });

  // Formato exigido pela Meta: onde a pessoa confere o pedido e o comprovante.
  const codigo = await registrarExclusao();
  return NextResponse.json({ url: urlAbsoluta(`/exclusao/${codigo}`), confirmation_code: codigo });
}
