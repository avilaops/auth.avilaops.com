import { NextRequest, NextResponse } from "next/server";
import { confirmarEmail } from "@/lib/confirmacaoEmail";
import { registrar } from "@/lib/eventos";
import { origemLocalDoLogout } from "@/lib/pedidoLogout";

export const runtime = "nodejs";
const resposta = (corpo: object, status = 200) => NextResponse.json(corpo, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

async function lerToken(req: NextRequest): Promise<string | null> {
  if (req.headers.get("content-type")?.split(";")[0] !== "application/json" || !req.body) return null;
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = []; let tamanho = 0;
  try {
    while (true) {
      const { value, done } = await leitor.read(); if (done) break;
      tamanho += value.byteLength;
      if (tamanho > 1024) { await leitor.cancel(); return null; }
      partes.push(value);
    }
  } finally { leitor.releaseLock(); }
  const corpo = JSON.parse(Buffer.concat(partes).toString("utf8"));
  return typeof corpo.token === "string" && /^[a-f0-9]{64}$/.test(corpo.token) ? corpo.token : null;
}

export async function POST(req: NextRequest) {
  if (!origemLocalDoLogout(req.headers.get("origin"))) return resposta({ erro: "Origem não autorizada." }, 403);
  let token;
  try { token = await lerToken(req); } catch { return resposta({ erro: "Pedido de confirmação inválido." }, 400); }
  if (!token) return resposta({ erro: "Pedido de confirmação inválido." }, 400);
  try {
    const resultado = await confirmarEmail(token);
    if (resultado.tipo === "invalido") return resposta({ erro: "Este link expirou ou não corresponde mais ao endereço atual. Peça outro na segurança da sua conta." }, 410);
    if (resultado.tipo === "usado") return resposta({ erro: "Este link já foi usado. Confira a segurança da sua conta." }, 409);
    if (resultado.tipo !== "confirmado") return resposta({ erro: "Confirmação inválida." }, 400);
    await registrar({ tipo: "email_confirmado", email: resultado.email, autor: resultado.email });
    return resposta({ mensagem: "E-mail confirmado. Sua senha e a verificação em duas etapas foram preservadas." });
  } catch { return resposta({ erro: "Não foi possível confirmar agora. Tente novamente." }, 503); }
}
