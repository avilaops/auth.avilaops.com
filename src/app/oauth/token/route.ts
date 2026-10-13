import { NextRequest, NextResponse } from "next/server";
import { appsDaIdentidade } from "@/lib/appsDaIdentidade";
import { buscarApp } from "@/lib/cadastro";
import { buscarConta } from "@/lib/contas";
import { registrar } from "@/lib/eventos";
import {
  assinarAccessToken,
  assinarIdToken,
  autenticarCliente,
  escopoConcedido,
  redirectUriValido,
  resgatarCodigoOAuth,
  TTL_TOKEN_SEGUNDOS,
  type ClienteOIDC,
  type IdentidadeOIDC,
} from "@/lib/oidc";
import { podeEntrar } from "@/lib/permissoes";
import { limitar } from "@/lib/rateLimit";
import { emitirRefresh, gastarRefresh, identidadeParaRenovar, revogarFamilia } from "@/lib/refreshOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function erro(code: string, descricao: string, status = 400) {
  return NextResponse.json(
    { error: code, error_description: descricao },
    { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

/** Corpo de sucesso do `token_endpoint`, igual para os dois caminhos. */
async function tokens(identidade: IdentidadeOIDC, cliente: ClienteOIDC, nonce: string | null, escopo: string, familia?: string) {
  const refresh = await emitirRefresh({ clienteId: cliente.id, sub: identidade.sub, email: identidade.email, familia, escopo });
  return NextResponse.json(
    {
      access_token: assinarAccessToken(identidade, cliente.id, escopo),
      id_token: await assinarIdToken(identidade, cliente.id, nonce, await appsDaIdentidade(identidade)),
      // Ausente só quando a tabela ainda não foi migrada.
      ...(refresh ? { refresh_token: refresh } : {}),
      token_type: "Bearer",
      expires_in: TTL_TOKEN_SEGUNDOS,
      scope: escopo,
    },
    { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

/**
 * Renova os tokens a partir de um refresh token.
 *
 * O token sozinho não basta: a conta é lida de novo. Conta desligada ou
 * removida, ou que perdeu o direito de entrar nesta aplicação, não renova, e a
 * família é revogada para o sistema parar de tentar.
 */
async function renovar(cliente: ClienteOIDC, corpo: URLSearchParams) {
  const apresentado = corpo.get("refresh_token");
  if (!apresentado) return erro("invalid_request", "`refresh_token` ausente.");

  const troca = await gastarRefresh(apresentado, cliente.id);
  if (!troca.ok) {
    if (troca.motivo === "reuso") {
      await registrar({ tipo: "oauth_refresh_reusado", email: troca.email, appId: cliente.appId, detalhe: `cliente ${cliente.id}: token já gasto apresentado de novo; família revogada` });
    }
    return erro("invalid_grant", "Refresh token inválido ou expirado.");
  }

  const identidade = identidadeParaRenovar(await buscarConta(troca.sub));
  const app = await buscarApp(cliente.appId);
  if (!identidade || (app && !(await podeEntrar(identidade.email, identidade.papel, app)))) {
    await revogarFamilia(troca.familia);
    return erro("invalid_grant", "Refresh token inválido ou expirado.");
  }
  // O escopo do SSF foi dado a alguém da equipe. Se a conta deixou de ser, a
  // renovação perde esses dois escopos junto com o papel.
  const escopo = escopoConcedido(troca.escopo, { clienteSsf: cliente.ssf, papel: identidade.papel });
  return tokens(identidade, cliente, null, escopo, troca.familia);
}

/** `token_endpoint`: troca o código de uso único, ou um refresh token, pelos tokens. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  if (!(await limitar(`oauth-token:${ip}`, 60, 15 * 60 * 1000))) {
    return erro("invalid_request", "Muitas tentativas. Tente novamente em alguns minutos.", 429);
  }

  let corpo: URLSearchParams;
  try {
    corpo = new URLSearchParams(await req.text());
  } catch {
    return erro("invalid_request", "Corpo inválido.");
  }

  const concessao = corpo.get("grant_type");
  if (concessao !== "authorization_code" && concessao !== "refresh_token") {
    return erro("unsupported_grant_type", "Só `authorization_code` e `refresh_token` são aceitos.");
  }

  const cliente: ClienteOIDC | null = await autenticarCliente(req.headers.get("authorization"), corpo);
  // Cliente inexistente e segredo errado devolvem a mesma resposta: distinguir
  // os casos diria a quem sonda quais `client_id` existem.
  if (!cliente) {
    return erro("invalid_client", "Cliente ou segredo inválidos.", 401);
  }
  if (concessao === "refresh_token") return renovar(cliente, corpo);

  const codigo = corpo.get("code");
  const redirectUri = corpo.get("redirect_uri");
  if (!codigo) return erro("invalid_request", "`code` ausente.");
  if (!redirectUriValido(cliente, redirectUri)) {
    return erro("invalid_grant", "`redirect_uri` não confere.");
  }

  const resgate = await resgatarCodigoOAuth(
    codigo,
    cliente.id,
    redirectUri as string,
    corpo.get("code_verifier"),
  );
  // Código inexistente, expirado, já usado, de outro cliente ou com PKCE
  // errado: uma resposta só, pelo mesmo motivo de sempre — não servir de
  // oráculo para quem estiver sondando.
  if (!resgate) return erro("invalid_grant", "Código inválido ou expirado.");

  const identidade = {
    sub: resgate.sub,
    email: resgate.email,
    nome: resgate.nome,
    foto: resgate.foto,
    papel: resgate.papel,
  };

  return tokens(identidade, cliente, resgate.nonce, resgate.escopo);
}
