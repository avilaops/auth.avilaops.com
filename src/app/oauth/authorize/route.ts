import { NextRequest, NextResponse } from "next/server";
import { buscarApp } from "@/lib/cadastro";
import { registrar } from "@/lib/eventos";
import {
  buscarCliente,
  emitirCodigoOAuth,
  redirectUriValido,
} from "@/lib/oidc";
import { podeEntrar } from "@/lib/permissoes";
import { desafioNecessario } from "@/lib/segundoFator";
import { lerSessao } from "@/lib/sessao";
import { urlAbsoluta, urlErro } from "@/lib/urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `authorization_endpoint` do OIDC.
 *
 * É a porta pela qual software de terceiro entra no login da casa. O usuário
 * chega aqui vindo do app (Outline, por exemplo), passa pela mesma tela de
 * `/login` que todo mundo usa, e volta para o app com um código de uso único.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;

  const cliente = await buscarCliente(q.get("client_id"));
  const redirectUri = q.get("redirect_uri");

  // Cliente ou destino inválidos: **não** redirecionar. Mandar o usuário de
  // volta para um endereço não registrado é justamente o ataque que o registro
  // previne — o erro tem de morrer aqui, na nossa tela.
  if (!cliente) return NextResponse.redirect(urlErro("Aplicativo desconhecido."), 302);
  if (!redirectUriValido(cliente, redirectUri)) {
    return NextResponse.redirect(urlErro("Endereço de retorno não autorizado."), 302);
  }
  const destino = new URL(redirectUri as string);

  const state = q.get("state");
  const devolver = (params: Record<string, string>) => {
    for (const [k, v] of Object.entries(params)) destino.searchParams.set(k, v);
    if (state) destino.searchParams.set("state", state);
    return NextResponse.redirect(destino.toString(), 302);
  };

  if ((q.get("response_type") ?? "code") !== "code") {
    return devolver({ error: "unsupported_response_type" });
  }

  const sessao = await lerSessao();
  if (!sessao) {
    // Volta para cá depois do login, com a query intacta. Caminho interno, que
    // é o que a tela de login aceita quando não vem `?app=`.
    const voltarPara = `${req.nextUrl.pathname}${req.nextUrl.search}`;
    return NextResponse.redirect(
      urlAbsoluta(`/login?returnTo=${encodeURIComponent(voltarPara)}`),
      302,
    );
  }

  // Mesma regra dos apps da casa: o cadastro de aplicações mais as permissões do painel.
  const app = await buscarApp(cliente.appId);

  // Enquanto a lista era fixa em código, o app do cliente OIDC sempre existia.
  // Agora a linha pode ser removida ou desativada no painel, e sem ela não há
  // regra a conferir. A resposta para "sem regra" é não, nunca "entra todo
  // mundo": as duas conferências abaixo só valem quando `app` existe.
  if (!app) {
    return devolver({
      error: "access_denied",
      error_description: `${cliente.nome} não está habilitado no login único.`,
    });
  }

  // E o mesmo segundo fator. Sem isto, software de terceiro (o Outline, por
  // exemplo) seria a porta que aceita uma sessão anterior ao 2FA e devolve um
  // token de identidade sem o fator — a exigência valeria em toda parte menos
  // onde a identidade é exportada.
  if (!sessao.mfa && (await desafioNecessario({ email: sessao.email, papel: sessao.papel, app })) !== "nenhum") {
    const voltarPara = `${req.nextUrl.pathname}${req.nextUrl.search}`;
    return NextResponse.redirect(
      urlAbsoluta(`/api/auth/mfa/elevar?returnTo=${encodeURIComponent(voltarPara)}`),
      302,
    );
  }
  if (app && !(await podeEntrar(sessao.email, sessao.papel, app))) {
    await registrar({
      tipo: "login_sem_permissao",
      email: sessao.email,
      appId: app.id,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      detalhe: "oidc",
    });
    return devolver({
      error: "access_denied",
      error_description: `Sua conta não tem acesso a ${app.nome}.`,
    });
  }

  const codigo = await emitirCodigoOAuth({
    clienteId: cliente.id,
    redirectUri: redirectUri as string,
    nonce: q.get("nonce"),
    codeChallenge: q.get("code_challenge"),
    codeChallengeMethod: q.get("code_challenge_method") ?? (q.get("code_challenge") ? "S256" : null),
    sub: sessao.sub,
    email: sessao.email,
    nome: sessao.nome,
    foto: sessao.foto,
    papel: sessao.papel,
  });

  await registrar({
    tipo: "login_ok",
    email: sessao.email,
    appId: cliente.appId,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    detalhe: "via oidc",
  });

  return devolver({ code: codigo });
}
