import { NextRequest, NextResponse } from "next/server";
import { returnToSeguro } from "@/lib/apps";
import { buscarApp } from "@/lib/cadastro";
import { buscarContaPorEmail, criarConta } from "@/lib/contas";
import { podeReemitirConvite } from "@/lib/convite";
import { emailDeConvite, textoDeFora, type DadosDoConvite, type Envio } from "@/lib/conviteEmail";
import { emailConfigurado, enviarEmail } from "@/lib/email";
import { registrar } from "@/lib/eventos";
import { autenticarCliente, type ClienteOIDC } from "@/lib/oidc";
import { concederPermissao, revogarPermissao } from "@/lib/permissoes";
import { prisma } from "@/lib/prisma";
import { limitar } from "@/lib/rateLimit";
import { emitirLinkRecuperacao } from "@/lib/recuperacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Provisionamento de acesso, de sistema para sistema.
 *
 * Um app da casa que só entra pelo login único (o TMS) precisa conseguir pôr a
 * própria gente para dentro sem alguém da Avila Ops abrir o painel: quando o
 * administrador de uma transportadora cadastra um motorista, o TMS chama aqui.
 *
 * Quem chama é um cliente OIDC, com o mesmo `client_id` e segredo do
 * `/oauth/token`, em `Authorization: Basic`. Cada cliente só mexe na liberação
 * do **próprio** app: o TMS não libera nem revoga acesso a outro sistema.
 *
 * `POST`   `{ email, nome, cpf?, telefone? }` — garante a conta e libera o app.
 *          `destino` é a porta de entrada do sistema (mesmo host), para onde a
 *          pessoa vai depois de criar a senha.
 *          Com `enviarConvite: true` (e, se quiser, `empresa` e `convidadoPor`),
 *          o login escreve para a pessoa. A resposta traz `envio`: `enviado`,
 *          `sem_email` (SMTP não configurado aqui), `limite` ou `falhou`.
 * `DELETE` `?email=` — revoga a liberação do app. A conta continua existindo.
 *
 * O convite (link para a pessoa definir a senha) só sai para conta **criada
 * nesta chamada**, ou criada antes por este mesmo sistema e ainda não assumida
 * pela pessoa (`podeReemitirConvite`). Para qualquer outra conta, nunca: senão
 * quem administra uma empresa no app poderia "convidar" o e-mail de outra
 * pessoa e receber um link que troca a senha dela, com tudo o que essa conta
 * já acessa. O convite guarda o sistema: criada a senha, a pessoa cai nele.
 */

const CONVITE_VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

function erro(status: number, mensagem: string) {
  return NextResponse.json({ error: mensagem }, { status, headers: { "Cache-Control": "no-store" } });
}

function clienteAutenticado(req: NextRequest): Promise<ClienteOIDC | null> {
  // Só o cabeçalho `Basic`: esta API não aceita credencial no corpo.
  const auth = req.headers.get("authorization");
  return auth?.startsWith("Basic ") ? autenticarCliente(auth) : Promise.resolve(null);
}

function emailValido(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const email = v.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.length <= max ? t : null;
}

/** `autor` do evento que criou a conta; nulo para conta anterior à auditoria. */
async function quemCriou(email: string): Promise<string | null> {
  const evento = await prisma.evento.findFirst({ where: { tipo: "conta_criada", email }, orderBy: { criadoEm: "asc" }, select: { autor: true } });
  return evento?.autor ?? null;
}

async function preparar(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
  if (!(await limitar(`provisionamento:${ip}`, 120, 15 * 60 * 1000))) {
    return { erro: erro(429, "Muitas chamadas. Tente novamente em alguns minutos.") } as const;
  }

  const cliente = await clienteAutenticado(req);
  if (!cliente) return { erro: erro(401, "Cliente ou segredo inválidos.") } as const;

  // Sem a linha do app no cadastro não há o que liberar.
  const app = await buscarApp(cliente.appId);
  if (!app) return { erro: erro(409, `${cliente.nome} não está habilitado no login único.`) } as const;

  return { cliente, app, autor: `app:${cliente.id}`, ip } as const;
}

export async function POST(req: NextRequest) {
  const p = await preparar(req);
  if ("erro" in p) return p.erro;

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const email = emailValido(corpo?.email);
  const nome = texto(corpo?.nome, 120);
  if (!email || !nome) return erro(400, "Informe nome e e-mail válido.");

  const cpf = typeof corpo?.cpf === "string" ? corpo.cpf.replace(/\D/g, "") : "";
  if (cpf && cpf.length !== 11) return erro(400, "CPF precisa ter 11 dígitos.");

  let conta = await buscarContaPorEmail(email);
  let criada = false;

  if (conta && !conta.ativa) {
    return erro(409, "Esta conta está desligada no login único. Fale com a equipe Avila Ops.");
  }

  if (!conta) {
    try {
      ({ conta } = await criarConta({
        nome,
        email,
        cpf: cpf || null,
        telefone: texto(corpo?.telefone, 30),
        role: "CLIENT",
      }));
      criada = true;
      await registrar({ tipo: "conta_criada", email, appId: p.cliente.appId, autor: p.autor, ip: p.ip, detalhe: "CLIENT" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("unique") || msg.includes("duplicate")) {
        // Corrida com outra chamada, ou o CPF já é de outra conta.
        conta = await buscarContaPorEmail(email);
        if (!conta) return erro(409, "Já existe conta com este CPF no login único.");
      } else {
        throw e;
      }
    }
  }

  await concederPermissao(email, p.cliente.appId, p.autor);
  await registrar({ tipo: "permissao_concedida", email, appId: p.cliente.appId, autor: p.autor, ip: p.ip });

  // Convite repetido (o sistema mandou de novo, ou a pessoa perdeu o e-mail):
  // sem isto a segunda mensagem diria "entre com a senha que já usa" a quem
  // nunca criou senha.
  const reemitir = !criada && conta !== null && podeReemitirConvite({ ...conta, criadaPor: await quemCriou(email) }, p.autor);

  // Porta de entrada do sistema (`/entrar`, `/api/auth/sso`…). Só vale endereço
  // do próprio host dele; qualquer outra coisa vira a raiz.
  const destino = returnToSeguro(typeof corpo?.destino === "string" ? corpo.destino : null, p.app);

  let convite: string | null = null;
  if (criada || reemitir) {
    convite = await emitirLinkRecuperacao(email, CONVITE_VALIDADE_MS, p.cliente.appId, destino);
    await registrar({ tipo: "recuperacao_emitida", email, appId: p.cliente.appId, autor: p.autor, ip: p.ip, detalhe: criada ? "convite, 7 dias" : "convite reenviado, 7 dias" });
  }

  // O sistema pediu que o login escreva para a pessoa. Enviado, o endereço de
  // criar senha não volta na resposta: foi direto à caixa de quem é. Se o envio
  // não saiu, ele volta como antes e o sistema decide o que fazer.
  let envio: Envio = "nao_pedido";
  if (corpo?.enviarConvite === true) {
    envio = await enviarConvite({
      email,
      nome: conta?.nome ?? nome,
      sistema: p.app.nome,
      enderecoDoSistema: destino,
      empresa: textoDeFora(corpo.empresa),
      convidadoPor: textoDeFora(corpo.convidadoPor),
      link: convite,
    });
    await registrar({ tipo: envio === "enviado" ? "convite_enviado" : "convite_nao_enviado", email, appId: p.cliente.appId, autor: p.autor, ip: p.ip, detalhe: envio === "enviado" ? (convite ? "com o endereço de criar senha" : "conta já tinha senha") : envio });
  }

  return NextResponse.json(
    { email, criada, convite: envio === "enviado" ? null : convite, envio },
    { status: criada ? 201 : 200, headers: { "Cache-Control": "no-store" } },
  );
}

/** Escreve para a pessoa convidada. Nunca lança: o acesso já foi liberado e a resposta diz o que houve com o e-mail. */
async function enviarConvite(d: DadosDoConvite & { email: string }): Promise<Envio> {
  if (!emailConfigurado()) return "sem_email";
  // Freio por destinatário: um sistema com defeito (ou alguém insistindo no
  // botão) não vira uma enxurrada na caixa de uma pessoa.
  if (!(await limitar(`convite-email:${d.email}`, 5, 60 * 60 * 1000))) return "limite";
  try {
    await enviarEmail({ para: d.email, ...emailDeConvite(d) });
    return "enviado";
  } catch (e) {
    console.error("[provisionamento] convite não enviado:", e instanceof Error ? e.message : e);
    return "falhou";
  }
}

export async function DELETE(req: NextRequest) {
  const p = await preparar(req);
  if ("erro" in p) return p.erro;

  const email = emailValido(req.nextUrl.searchParams.get("email"));
  if (!email) return erro(400, "Informe um e-mail válido.");

  await revogarPermissao(email, p.cliente.appId);
  await registrar({ tipo: "permissao_revogada", email, appId: p.cliente.appId, autor: p.autor, ip: p.ip });

  return NextResponse.json({ email, revogada: true }, { headers: { "Cache-Control": "no-store" } });
}
