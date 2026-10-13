import { NextRequest, NextResponse } from "next/server";
import { destinoInicial } from "@/lib/admin";
import { returnToSeguro } from "@/lib/apps";
import { buscarApp } from "@/lib/cadastro";
import { autenticarCaixa } from "@/lib/caixaEmail";
import { APP_DO_LOJAS, autenticarDonoDeLoja } from "@/lib/senhaDaLoja";
import { autenticar, papelDaRole, type Conta } from "@/lib/contas";
import { resolverLogin } from "@/lib/vinculos";
import { registrar } from "@/lib/eventos";
import { concederPermissao, podeEntrar } from "@/lib/permissoes";
import { entrar } from "@/lib/entrada";
import { limitar, liberar } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * Login por e-mail/CPF + senha contra `portal_clients`.
 *
 * Equipe (role ADMIN) e cliente (role CLIENT) entram pelo mesmo formulário; o
 * papel do SSO deriva da role. O que cada um pode abrir é decidido em
 * `podeEntrar`, com base no cadastro de aplicações e nas permissões do painel.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";

  let corpo: { login?: unknown; senha?: unknown; app?: unknown; returnTo?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }

  const login = typeof corpo.login === "string" ? corpo.login : "";
  const senha = typeof corpo.senha === "string" ? corpo.senha : "";
  const appId = typeof corpo.app === "string" ? corpo.app : null;
  const returnTo = typeof corpo.returnTo === "string" ? corpo.returnTo : null;

  if (!login || !senha) {
    return NextResponse.json({ erro: "Informe login e senha." }, { status: 400 });
  }

  // Duas travas: uma por IP, para conter varredura; outra por login, para que
  // um atacante não gaste as tentativas de uma conta alheia a partir de vários
  // IPs sem ser barrado.
  if (!(await limitar(`ip:${ip}`, 20, 15 * 60 * 1000)) || !(await limitar(`login:${login.toLowerCase()}`, 8, 15 * 60 * 1000))) {
    return NextResponse.json(
      { erro: "Muitas tentativas. Tente novamente em alguns minutos." },
      { status: 429 },
    );
  }

  let conta: Conta | null = await autenticar(login, senha);
  let viaCaixa = false;
  let viaLoja = false;

  // Sem conta Avila Ops (ou senha diferente): pode ser a senha da caixa de
  // e-mail. Provar a senha da caixa prova a posse do endereço, então vale
  // como conector — cria/vincula a conta CLIENTE por e-mail.
  if (!conta && login.includes("@")) {
    const caixa = await autenticarCaixa(login, senha);
    if (caixa) {
      const r = await resolverLogin(
        "mail",
        { id: caixa.id, email: caixa.address, emailVerificado: true, nome: caixa.displayName, foto: null },
        ip,
      );
      if (r.ok) {
        conta = r.conta;
        viaCaixa = true;
      } else {
        // Conta ADMIN com esse e-mail: senha da caixa não pode virar sessão da equipe.
        await registrar({ tipo: "login_falhou", email: caixa.address, appId, ip, detalhe: `mail: ${r.motivo}` });
        return NextResponse.json({ erro: "Login ou senha inválidos." }, { status: 401 });
      }
    }
  }

  // Ainda sem conta: pode ser a senha da loja de quem se cadastrou no Lojas
  // (conta só lá). Mesmo raciocínio da caixa: o dono confirmou o e-mail no
  // cadastro, então a senha da loja prova a posse do endereço.
  if (!conta && login.includes("@")) {
    const dono = await autenticarDonoDeLoja(login, senha);
    if (dono) {
      const r = await resolverLogin("lojas", { id: dono.id, email: dono.email, emailVerificado: true, nome: null, foto: null }, ip);
      if (r.ok) {
        conta = r.conta;
        viaLoja = true;
        // Dono da loja entra no Lojas: a liberação vem da própria prova de posse.
        await concederPermissao(conta.email, APP_DO_LOJAS, "conector:lojas");
        await registrar({ tipo: "permissao_concedida", email: conta.email, appId: APP_DO_LOJAS, ip, autor: "conector:lojas" });
      } else {
        await registrar({ tipo: "login_falhou", email: dono.email, appId, ip, detalhe: `lojas: ${r.motivo}` });
        return NextResponse.json({ erro: "Login ou senha inválidos." }, { status: 401 });
      }
    }
  }

  // Mensagem única para credencial errada e login inexistente: distinguir os
  // dois entrega de graça a lista de quem tem conta.
  if (!conta) {
    await registrar({ tipo: "login_falhou", email: login.includes("@") ? login : null, appId, ip });
    return NextResponse.json({ erro: "Login ou senha inválidos." }, { status: 401 });
  }

  const papel = papelDaRole(conta.role);
  const app = await buscarApp(appId);

  if (app && !(await podeEntrar(conta.email, papel, app))) {
    await registrar({ tipo: "login_sem_permissao", email: conta.email, appId: app.id, ip });
    return NextResponse.json(
      { erro: `Sua conta não tem acesso a ${app.nome}.` },
      { status: 403 },
    );
  }

  await liberar(`login:${login.toLowerCase()}`);

  let destino: string;
  if (app) destino = returnToSeguro(returnTo, app);
  else if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) destino = returnTo;
  else destino = destinoInicial({ email: conta.email, papel });

  // A senha só provou a primeira metade. Quem decide se já há sessão, ou se
  // ainda falta o segundo fator, é o `entrar` — o mesmo para todos os caminhos.
  const entrada = await entrar(
    {
      sub: conta.id,
      email: conta.email,
      nome: conta.nome,
      foto: null,
      papel,
      destino,
      app,
      // Quem entrou pela senha da caixa não tem senha Avila Ops para trocar.
      senhaProvisoria: conta.senhaProvisoria && !viaCaixa && !viaLoja,
      via: viaCaixa ? "senha da caixa de e-mail" : viaLoja ? "senha da loja" : "senha",
    },
    ip,
  );

  return NextResponse.json({
    ok: true,
    senhaProvisoria: conta.senhaProvisoria,
    destino: entrada.destino,
    segundoFator: entrada.tipo === "desafio" ? entrada.motivo : null,
  });
}
