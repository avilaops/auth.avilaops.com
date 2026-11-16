import { createHash } from "crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { emailAceito, normalizarEmail } from "@/lib/cadastroProprio";
import { politicaDaAplicacao } from "@/lib/cadastro";
import { buscarContaPorEmail } from "@/lib/contas";
import { emailConfigurado, enviarEmail } from "@/lib/email";
import { emailDeRecuperacao } from "@/lib/emailRecuperacao";
import { registrar } from "@/lib/eventos";
import { origemDoCadastro } from "@/lib/origemDoCadastro";
import { origemLocalDoLogout } from "@/lib/pedidoLogout";
import { limitar } from "@/lib/rateLimit";
import { emitirLinkRecuperacao } from "@/lib/recuperacao";

export const runtime = "nodejs";

const MENSAGEM = { ok: true, mensagem: "Se houver uma conta ativa para esse endereço, enviaremos um link para redefinir sua senha. Confira também a caixa de spam." };
const resposta = (body: object, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

export async function POST(req: NextRequest) {
  if (!origemLocalDoLogout(req.headers.get("origin"))) return resposta({ erro: "Origem não autorizada." }, 403);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  if (!(await limitar(`recuperacao-ip:${ip}`, 8, 15 * 60 * 1000))) {
    return resposta({ erro: "Muitas tentativas. Tente de novo mais tarde." }, 429);
  }
  let body: { email?: unknown; app?: unknown; returnTo?: unknown };
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return resposta({ erro: "Requisição inválida." }, 400);
    body = parsed;
  } catch { return resposta({ erro: "Requisição inválida." }, 400); }
  const email = typeof body.email === "string" ? normalizarEmail(body.email) : "";
  if (!emailAceito(email)) return resposta({ erro: "Informe um e-mail válido." }, 400);
  if (!emailConfigurado()) return resposta({ erro: "O envio de recuperação está temporariamente indisponível. Tente novamente mais tarde." }, 503);
  const emailHash = createHash("sha256").update(email).digest("hex");
  if (!(await limitar(`recuperacao-email:${emailHash}`, 3, 60 * 60 * 1000))) return resposta(MENSAGEM);

  // A consulta da identidade e o SMTP acontecem depois da resposta, inclusive
  // para conta desconhecida. Não expor existência por status ou tempo do envio.
  after(async () => {
    try {
      const origem = await origemDoCadastro(body.app, body.returnTo);
      if (origem.app && !(await politicaDaAplicacao(origem.app))?.permiteRecuperacao) return;
      const conta = await buscarContaPorEmail(email);
      if (!conta || !conta.ativa) return;
      const link = await emitirLinkRecuperacao(conta.email, undefined, origem.app, origem.returnTo);
      await enviarEmail({ para: conta.email, ...emailDeRecuperacao(link) });
      await registrar({ tipo: "recuperacao_emitida", email: conta.email, ip });
    } catch {
      // Respostas e logs não levam endereço, URL de recuperação ou resposta SMTP.
      console.error("[recuperacao] Não foi possível concluir o envio do link.");
    }
  });
  return resposta(MENSAGEM);
}
