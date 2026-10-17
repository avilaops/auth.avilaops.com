import { randomBytes } from "crypto";
import { credenciais } from "@/lib/conectores";
import { chaveConfigurada, cifrar, decifrar } from "@/lib/cripto";
import {
  TIPOS_ATIVO,
  coletarAtivos,
  inscreverWaba,
  lerCadastroWhatsapp,
  lerEscopos,
  perfilMeta,
  permissoesMeta,
  renovarTokenMeta,
  revogarMeta,
  trocarCodigoCadastro,
  type TipoAtivo,
  type TokenMeta,
} from "@/lib/meta";
import type { PedidoCadastro } from "@/lib/cadastroWhatsapp";
import { prisma } from "@/lib/prisma";
import { urlAbsoluta } from "@/lib/urls";

/**
 * Conexão de ativos da Meta: o que vai ao banco.
 *
 * O protocolo está em `meta.ts`. Aqui ficam as três regras que não podem se
 * perder: token só entra cifrado, token nunca sai para a tela, e o que a Meta
 * manda apagar é apagado.
 */

export const COOKIE_FLUXO_META = "avila_meta_fluxo";

export type AppMeta = {
  clientId: string;
  clientSecret: string;
  escopos: string[];
  configId: string | null;
  /** Configuração do cadastro incorporado do WhatsApp; sem ela, o botão não aparece. */
  configIdWhatsapp: string | null;
};

/** Ativo ligado pelo cadastro incorporado do WhatsApp. */
export const ORIGEM_CADASTRO = "cadastro_incorporado";

/**
 * App da Meta configurado em `/admin/conectores/facebook`.
 *
 * Vale mesmo com o login por Facebook desligado. Sem `AUTH_ENCRYPTION_KEY`
 * devolve `null`: conectar sem ter como cifrar seria guardar token em claro.
 */
export async function appMeta(): Promise<AppMeta | null> {
  if (!chaveConfigurada()) return null;
  const cred = await credenciais("facebook", { mesmoDesligado: true }).catch(() => null);
  if (!cred?.clientSecret) return null;
  return {
    clientId: cred.clientId,
    clientSecret: cred.clientSecret,
    escopos: lerEscopos(cred.extras.escoposConexao),
    configId: cred.extras.configId?.trim() || null,
    configIdWhatsapp: cred.extras.configIdWhatsapp?.trim() || null,
  };
}

export function redirectUriMeta(): string {
  return urlAbsoluta("/api/meta/callback");
}

/** P2021: tabela ausente. P2022: coluna ausente. Mesmo critério de `segundoFator.ts`. */
function migracaoFaltando(erro: unknown): boolean {
  const codigo = (erro as { code?: unknown })?.code;
  return codigo === "P2021" || codigo === "P2022";
}

export type AtivoTela = {
  tipo: TipoAtivo;
  externoId: string;
  nome: string;
  detalhe: Record<string, string | number | boolean | null>;
  origem: string;
};

export type ConexaoTela = {
  nome: string | null;
  fbUserId: string;
  escopos: string[];
  recusados: string[];
  expiraEm: Date | null;
  expirada: boolean;
  sincronizadoEm: Date | null;
  criadoEm: Date;
  ativos: AtivoTela[];
};

function lerDetalhe(json: string | null): AtivoTela["detalhe"] {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as AtivoTela["detalhe"]) : {};
  } catch {
    return {};
  }
}

const lista = (texto: string) => texto.split(" ").filter(Boolean);

/**
 * A conexão da conta, pronta para a tela — sem token nenhum.
 *
 * `"indisponivel"` quando a migração ainda não rodou: a página avisa em vez de
 * quebrar, que foi a lição do segundo fator.
 */
export async function buscarConexao(contaId: string): Promise<ConexaoTela | null | "indisponivel"> {
  let c;
  try {
    c = await prisma.conexaoMeta.findUnique({
      where: { contaId },
      include: { ativos: { orderBy: [{ tipo: "asc" }, { nome: "asc" }] } },
    });
  } catch (e) {
    if (migracaoFaltando(e)) return "indisponivel";
    throw e;
  }
  if (!c) return null;
  return {
    nome: c.nome,
    fbUserId: c.fbUserId,
    escopos: lista(c.escopos),
    recusados: lista(c.recusados),
    expiraEm: c.expiraEm,
    expirada: !!c.expiraEm && c.expiraEm.getTime() < Date.now(),
    sincronizadoEm: c.sincronizadoEm,
    criadoEm: c.criadoEm,
    ativos: c.ativos
      .filter((a) => (TIPOS_ATIVO as readonly string[]).includes(a.tipo))
      .map((a) => ({ tipo: a.tipo as TipoAtivo, externoId: a.externoId, nome: a.nome, detalhe: lerDetalhe(a.detalhe), origem: a.origem })),
  };
}

/**
 * Lê os ativos na Graph e deixa o banco igual ao que a Meta respondeu.
 *
 * Tipo que falhou fica como estava; tipo lido é substituído por inteiro —
 * inclusive por lista vazia, que é como um acesso perdido some daqui. O que
 * foi ligado pelo cadastro incorporado não entra nessa conta: o token da
 * pessoa não enxerga a conta do WhatsApp que ela deu à casa por lá.
 */
async function gravarAtivos(conexaoId: string, token: string, segredo: string, concedidos: string[]): Promise<void> {
  const coleta = await coletarAtivos({ token, segredo }, concedidos);
  const agora = new Date();

  await prisma.$transaction(async (tx) => {
    for (const tipo of TIPOS_ATIVO) {
      const coletados = coleta[tipo];
      if (coletados === "falhou") continue;
      const doCadastro = new Set(
        (await tx.ativoMeta.findMany({ where: { conexaoId, tipo, origem: ORIGEM_CADASTRO }, select: { externoId: true } })).map((a) => a.externoId),
      );
      const lidos = coletados.filter((a) => !doCadastro.has(a.externoId));

      await tx.ativoMeta.deleteMany({
        where: { conexaoId, tipo, origem: { not: ORIGEM_CADASTRO }, externoId: { notIn: lidos.map((a) => a.externoId) } },
      });
      for (const a of lidos) {
        const dados = {
          nome: a.nome,
          detalhe: JSON.stringify(a.detalhe),
          tokenEnc: a.token ? cifrar(a.token) : null,
          sincronizadoEm: agora,
        };
        await tx.ativoMeta.upsert({
          where: { conexaoId_tipo_externoId: { conexaoId, tipo, externoId: a.externoId } },
          create: { conexaoId, tipo, externoId: a.externoId, ...dados },
          update: dados,
        });
      }
    }
    await tx.conexaoMeta.update({ where: { id: conexaoId }, data: { sincronizadoEm: agora } });
  });
}

/** Grava a conexão recém-autorizada e já lê os ativos. */
export async function conectar(conta: { id: string; email: string }, app: AppMeta, tk: TokenMeta): Promise<{ ativos: number }> {
  const acesso = { token: tk.token, segredo: app.clientSecret };
  const [perfil, perms] = await Promise.all([perfilMeta(acesso), permissoesMeta(acesso)]);

  const dados = {
    email: conta.email.toLowerCase(),
    fbUserId: perfil.id,
    nome: perfil.nome,
    tokenEnc: cifrar(tk.token),
    escopos: perms.concedidos.join(" "),
    recusados: perms.recusados.join(" "),
    expiraEm: tk.expiraEm,
  };
  const c = await prisma.conexaoMeta.upsert({
    where: { contaId: conta.id },
    create: { contaId: conta.id, ...dados },
    update: dados,
  });

  await gravarAtivos(c.id, tk.token, app.clientSecret, perms.concedidos);
  return { ativos: await prisma.ativoMeta.count({ where: { conexaoId: c.id } }) };
}

export type WhatsappLigado = { nomeDaConta: string; numero: string | null; inscrito: boolean };

/**
 * Grava o WhatsApp que a pessoa ligou pela janela da Meta (cadastro
 * incorporado).
 *
 * Troca o código pelo token da empresa, lê com ele a conta e o número (é o que
 * prova que os identificadores vindos do navegador são dessa empresa) e inscreve
 * o app nos avisos da conta, para as mensagens chegarem.
 *
 * O número vira um ativo `whatsapp` com o token da empresa, no mesmo formato
 * que os sistemas já leem em `/api/meta/ativos`. Conta sem conexão com a Meta
 * ganha uma, feita com esse token: ele não vence, então a conexão também não.
 */
export async function ligarWhatsapp(conta: { id: string; email: string }, app: AppMeta, pedido: PedidoCadastro): Promise<WhatsappLigado> {
  const tk = await trocarCodigoCadastro({ clientId: app.clientId, clientSecret: app.clientSecret, code: pedido.code });
  const acesso = { token: tk.token, segredo: app.clientSecret };
  const lido = await lerCadastroWhatsapp(acesso, pedido.wabaId, pedido.phoneNumberId);

  let inscrito = true;
  try {
    await inscreverWaba(acesso, lido.wabaId);
  } catch (e) {
    // Fica gravado e a tela avisa: o número está ligado, mas as mensagens ainda não chegam.
    inscrito = false;
    console.error("[meta] inscrição nos avisos do WhatsApp", e instanceof Error ? e.message : e);
  }

  let conexao = await prisma.conexaoMeta.findUnique({ where: { contaId: conta.id } });
  if (!conexao) {
    const [perfil, perms] = await Promise.all([perfilMeta(acesso), permissoesMeta(acesso)]);
    conexao = await prisma.conexaoMeta.create({
      data: {
        contaId: conta.id,
        email: conta.email.toLowerCase(),
        fbUserId: perfil.id,
        nome: perfil.nome,
        tokenEnc: cifrar(tk.token),
        escopos: perms.concedidos.join(" "),
        recusados: perms.recusados.join(" "),
        expiraEm: tk.expiraEm,
      },
    });
  }

  const dados = {
    nome: lido.nomeDaConta,
    detalhe: JSON.stringify({
      numeros: lido.numero?.exibido ?? null,
      numeroIds: lido.numero?.id ?? null,
      nomeVerificado: lido.numero?.nome ?? null,
      negocioId: pedido.businessId,
      avisos: inscrito ? "inscrito" : "falhou",
    }),
    tokenEnc: cifrar(tk.token),
    origem: ORIGEM_CADASTRO,
    sincronizadoEm: new Date(),
  };
  await prisma.ativoMeta.upsert({
    where: { conexaoId_tipo_externoId: { conexaoId: conexao.id, tipo: "whatsapp", externoId: lido.wabaId } },
    create: { conexaoId: conexao.id, tipo: "whatsapp", externoId: lido.wabaId, ...dados },
    update: dados,
  });
  return { nomeDaConta: lido.nomeDaConta, numero: lido.numero?.exibido ?? null, inscrito };
}

/** Relê permissões e ativos com o token já guardado. */
export async function sincronizar(contaId: string, app: AppMeta): Promise<void> {
  const c = await prisma.conexaoMeta.findUnique({ where: { contaId } });
  if (!c) return;
  const token = decifrar(c.tokenEnc);
  const perms = await permissoesMeta({ token, segredo: app.clientSecret });
  await prisma.conexaoMeta.update({
    where: { id: c.id },
    data: { escopos: perms.concedidos.join(" "), recusados: perms.recusados.join(" ") },
  });
  await gravarAtivos(c.id, token, app.clientSecret, perms.concedidos);
}

/**
 * Desliga a conexão: revoga o app na Meta e apaga token e ativos daqui.
 *
 * A revogação é tentativa — token já vencido ou Meta fora do ar não podem
 * impedir a pessoa de tirar os dados dela do nosso banco.
 */
export async function desconectar(contaId: string, app: AppMeta | null): Promise<boolean> {
  const c = await prisma.conexaoMeta.findUnique({ where: { contaId } });
  if (!c) return false;
  if (app) {
    try {
      await revogarMeta({ token: decifrar(c.tokenEnc), segredo: app.clientSecret });
    } catch (e) {
      console.error("[meta] revogação", e instanceof Error ? e.message : e);
    }
  }
  await prisma.conexaoMeta.delete({ where: { id: c.id } });
  return true;
}

/**
 * A Meta avisou que a pessoa removeu o app ou pediu a exclusão dos dados.
 *
 * `comLogin` apaga também o vínculo de login com Facebook: no pedido de
 * exclusão sai tudo o que veio da Meta; na simples desautorização o vínculo
 * fica, porque ele não guarda token e a pessoa pode voltar a entrar.
 *
 * Devolve os e-mails afetados, para a auditoria.
 */
export async function apagarPorUsuarioMeta(fbUserId: string, opts: { comLogin: boolean }): Promise<string[]> {
  const conexoes = await prisma.conexaoMeta.findMany({ where: { fbUserId }, select: { email: true } });
  await prisma.conexaoMeta.deleteMany({ where: { fbUserId } });

  const emails = new Set(conexoes.map((c) => c.email));
  if (opts.comLogin) {
    const vinculos = await prisma.vinculo.findMany({
      where: { provedor: "facebook", provedorUserId: fbUserId },
      select: { email: true },
    });
    await prisma.vinculo.deleteMany({ where: { provedor: "facebook", provedorUserId: fbUserId } });
    for (const v of vinculos) if (v.email) emails.add(v.email.toLowerCase());
  }
  return [...emails];
}

/** Comprovante que a Meta mostra à pessoa. Aleatório: não deriva de dado nenhum dela. */
export async function registrarExclusao(): Promise<string> {
  const codigo = randomBytes(12).toString("hex");
  await prisma.exclusaoMeta.create({ data: { codigo } });
  return codigo;
}

export async function buscarExclusao(codigo: string): Promise<Date | null> {
  if (!/^[0-9a-f]{24}$/.test(codigo)) return null;
  const e = await prisma.exclusaoMeta.findUnique({ where: { codigo } }).catch(() => null);
  return e?.concluidaEm ?? null;
}

/** Renova quando faltam menos de 15 dias dos ~60 que o token dura. */
const RENOVAR_ANTES_MS = 15 * 24 * 60 * 60 * 1000;

export type AtivoEntregue = AtivoTela & { token: string | null };

export type ConexaoEntregue = {
  contaId: string;
  email: string;
  fbUserId: string;
  nome: string | null;
  escopos: string[];
  expiraEm: Date | null;
  renovado: boolean;
  /** Token de usuário da Meta, de longa duração. */
  token: string;
  ativos: AtivoEntregue[];
};

/**
 * A conexão de uma conta, **com os tokens**, para um sistema autorizado.
 *
 * É a única função do auth que tira token da Meta do banco em claro. Quem
 * chama (`/api/meta/ativos`) já conferiu a credencial do sistema e a permissão
 * `acessoMeta`, e registra a leitura em `eventos`.
 *
 * Aproveita a passagem para renovar: token perto de vencer é trocado antes de
 * ser entregue, então quem usa a conexão a mantém viva sem tarefa agendada.
 * Conexão vencida devolve `"vencida"`, para o sistema saber que precisa mandar
 * o cliente conectar de novo.
 */
export async function entregarConexao(email: string, app: AppMeta): Promise<ConexaoEntregue | "vencida" | null> {
  const c = await prisma.conexaoMeta.findFirst({
    where: { email: email.trim().toLowerCase() },
    orderBy: { atualizadoEm: "desc" },
    include: { ativos: { orderBy: [{ tipo: "asc" }, { nome: "asc" }] } },
  });
  if (!c) return null;

  const agora = Date.now();
  if (c.expiraEm && c.expiraEm.getTime() <= agora) return "vencida";

  let token = decifrar(c.tokenEnc);
  let expiraEm = c.expiraEm;
  let renovado = false;
  if (expiraEm && expiraEm.getTime() - agora < RENOVAR_ANTES_MS) {
    try {
      const novo = await renovarTokenMeta({ clientId: app.clientId, clientSecret: app.clientSecret, token });
      await prisma.conexaoMeta.update({ where: { id: c.id }, data: { tokenEnc: cifrar(novo.token), expiraEm: novo.expiraEm } });
      token = novo.token;
      expiraEm = novo.expiraEm;
      renovado = true;
    } catch (e) {
      // Renovar é oportunidade, não requisito: o token atual ainda vale.
      console.error("[meta] renovação", e instanceof Error ? e.message : e);
    }
  }

  return {
    contaId: c.contaId,
    email: c.email,
    fbUserId: c.fbUserId,
    nome: c.nome,
    escopos: lista(c.escopos),
    expiraEm,
    renovado,
    token,
    ativos: c.ativos
      .filter((a) => (TIPOS_ATIVO as readonly string[]).includes(a.tipo))
      .map((a) => ({
        tipo: a.tipo as TipoAtivo,
        externoId: a.externoId,
        nome: a.nome,
        detalhe: lerDetalhe(a.detalhe),
        origem: a.origem,
        token: a.tokenEnc ? decifrar(a.tokenEnc) : null,
      })),
  };
}