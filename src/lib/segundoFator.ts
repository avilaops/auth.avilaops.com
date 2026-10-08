import { createHash, randomInt } from "crypto";
import type { AppRegistrado, Papel } from "@/lib/apps";
import { chaveConfigurada, cifrar, decifrar } from "@/lib/cripto";
import { registrar } from "@/lib/eventos";
import { prisma } from "@/lib/prisma";
import { gerarSegredo, segredoLegivel, uriOtpauth, verificarCodigo } from "@/lib/totp";

/**
 * Verificação em duas etapas da Ávila Ops.
 *
 * A senha sozinha abre o painel de contas, os conectores e, por tabela, todo
 * app que confia no cookie `avila_sso`. Uma senha vazada em qualquer lugar
 * derrubava a confiança do ecossistema inteiro. O segundo fator corta isso:
 * quem entra precisa provar posse do celular, e o fator é conferido **antes**
 * de existir sessão — nunca depois.
 *
 * Quem é obrigado: a equipe (papel `ADMIN` do SSO, que cobre OWNER, SOCIO e
 * ADMIN). Cliente pode ativar por conta própria em `/conta`, e um app pode
 * exigir de todo mundo com `exigeSegundoFator` no cadastro (`/admin/apps`).
 */

/** Quantos códigos de recuperação a ativação entrega. */
export const QUANTIDADE_CODIGOS = 10;

/** Mesmo alfabeto da senha provisória: sem 0/O/1/I/L, para ditar por telefone. */
const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export type EstadoFator = {
  /** Confirmado com um código do aplicativo — é o que vale como fator. */
  ativo: boolean;
  /** Cadastro começado e nunca confirmado: o segredo existe, mas não protege nada. */
  pendente: boolean;
  confirmadoEm: Date | null;
  ultimoUsoEm: Date | null;
  codigosRestantes: number;
};

/**
 * Migração ainda não aplicada no banco.
 *
 * Descoberto na primeira consulta que bate numa tabela inexistente (Prisma
 * P2021). Enquanto vale, o segundo fator se comporta como indisponível — que é
 * a verdade: tabela que não existe não guarda fator de ninguém.
 *
 * Isto existe porque a falta dela derrubou o `/login` em produção: o código
 * subiu antes de `prisma migrate deploy` rodar, e a consulta do fator
 * explodia no meio da renderização da página. Quem tinha cookie de sessão via
 * "a server error occurred" e não conseguia nem chegar ao formulário; quem não
 * tinha via a tela normal, e por isso o healthcheck (que pede `/login`
 * anônimo) seguiu verde o tempo todo. Uma exigência de segurança não pode
 * transformar a falta de uma migração em porta trancada.
 */
let migracaoPendente = false;

/** P2021: tabela ausente. P2022: coluna ausente — migração pela metade. */
function migracaoFaltando(erro: unknown): boolean {
  const codigo = (erro as { code?: unknown })?.code;
  return codigo === "P2021" || codigo === "P2022";
}

function marcarMigracaoPendente(erro: unknown): void {
  if (!migracaoPendente) {
    migracaoPendente = true;
    console.error(
      "[segundo fator] tabelas ausentes no banco — rode `prisma migrate deploy`. " +
        "A exigência de verificação em duas etapas fica suspensa até lá.",
      erro,
    );
    void registrar({
      tipo: "mfa_indisponivel",
      detalhe: "tabelas do segundo fator ausentes: prisma migrate deploy pendente",
    });
  }
}

/**
 * Sem `AUTH_ENCRYPTION_KEY` não há como guardar o segredo cifrado, então não
 * há como cadastrar fator nenhum.
 *
 * Nesse caso a exigência é **suspensa** em vez de bloquear o login. É uma
 * escolha consciente: exigir um fator que ninguém consegue cadastrar trancaria
 * a equipe inteira para fora do próprio SSO, sem tela de recuperação possível.
 * O rastro fica em `eventos` (`mfa_indisponivel`) e o painel avisa em vermelho.
 */
export function mfaDisponivel(): boolean {
  return chaveConfigurada() && !migracaoPendente;
}

/**
 * Política: quem precisa de segundo fator.
 *
 * `MFA_EQUIPE=opcional` afrouxa para a equipe durante uma janela de migração —
 * quem já ativou continua sendo desafiado de qualquer jeito (ver
 * `desafioNecessario`), porque fator ativo nunca deixa de valer.
 */
export function exigeSegundoFator(p: { papel: Papel; app?: AppRegistrado | null }): boolean {
  return mfaDisponivel() && politicaExige(p);
}

/**
 * A política pura, sem olhar se o servidor consegue cumpri-la.
 *
 * Existe separada para dar nome à diferença entre "não é exigido" e "é
 * exigido, mas está suspenso" — é essa segunda que precisa virar evento
 * (`mfa_indisponivel`) em vez de passar despercebida.
 */
export function politicaExige(p: { papel: Papel; app?: AppRegistrado | null }): boolean {
  if (p.app?.exigeSegundoFator) return true;
  if (p.papel !== "ADMIN") return false;
  return (process.env.MFA_EQUIPE ?? "obrigatorio").toLowerCase() !== "opcional";
}

/**
 * O que falta para esta pessoa ter sessão.
 *
 * - `nenhum`: pode entrar direto.
 * - `verificar`: tem fator ativo, precisa digitar o código.
 * - `cadastrar`: a política exige fator e ela ainda não tem — cadastra agora,
 *   antes de a sessão nascer. Adiar o cadastro para depois do login é o mesmo
 *   que não exigir: bastaria nunca voltar à tela.
 */
export async function desafioNecessario(p: {
  email: string;
  papel: Papel;
  app?: AppRegistrado | null;
}): Promise<"nenhum" | "verificar" | "cadastrar"> {
  if (!mfaDisponivel()) return "nenhum";
  const fator = await buscar(p.email);
  if (fator?.confirmadoEm) return "verificar";
  return exigeSegundoFator(p) ? "cadastrar" : "nenhum";
}

const SEM_FATOR: EstadoFator = {
  ativo: false,
  pendente: false,
  confirmadoEm: null,
  ultimoUsoEm: null,
  codigosRestantes: 0,
};

export type Diagnostico = {
  /** O segundo fator está realmente protegendo alguém? */
  disponivel: boolean;
  /** `AUTH_ENCRYPTION_KEY` presente e no formato certo. */
  chave: boolean;
  /** As tabelas do fator existem neste banco. */
  migracoes: "aplicadas" | "pendentes";
};

/**
 * O estado real do segundo fator neste servidor.
 *
 * Existe porque as duas formas de suspensão — chave ausente e migração
 * pendente — são silenciosas por desenho: o login continua funcionando, que é o
 * certo, mas ninguém fica sabendo que a segunda metade da porta sumiu. Isto dá
 * a resposta a quem pergunta: o `/api/saude` e o painel.
 *
 * A sonda é um `count` barato, e absorve tabela ausente como todo o resto do
 * módulo — perguntar pela saúde não pode ser o que derruba o serviço.
 */
export async function diagnosticar(): Promise<Diagnostico> {
  const chave = chaveConfigurada();
  if (!migracaoPendente) {
    try {
      await prisma.segundoFator.count();
    } catch (erro) {
      if (!migracaoFaltando(erro)) throw erro;
      marcarMigracaoPendente(erro);
    }
  }
  return {
    disponivel: chave && !migracaoPendente,
    chave,
    migracoes: migracaoPendente ? "pendentes" : "aplicadas",
  };
}

export async function estado(email: string): Promise<EstadoFator> {
  if (migracaoPendente) return SEM_FATOR;
  const fator = await prisma.segundoFator
    .findUnique({
      where: { email: normalizar(email) },
      include: { codigos: { where: { usadoEm: null }, select: { id: true } } },
    })
    .catch((erro) => {
      if (!migracaoFaltando(erro)) throw erro;
      marcarMigracaoPendente(erro);
      return null;
    });
  return {
    ativo: !!fator?.confirmadoEm,
    pendente: !!fator && !fator.confirmadoEm,
    confirmadoEm: fator?.confirmadoEm ?? null,
    ultimoUsoEm: fator?.ultimoUsoEm ?? null,
    codigosRestantes: fator?.codigos.length ?? 0,
  };
}

/**
 * Começa (ou recomeça) o cadastro e devolve o segredo para o QR.
 *
 * Recomeçar gera segredo novo de propósito: se a pessoa abandonou o cadastro
 * no meio, o segredo antigo pode ter ficado num aplicativo de um celular que
 * não é mais dela. Fator já confirmado não passa por aqui — para trocar de
 * celular, desativa e ativa de novo, provando que ainda tem o atual.
 */
export async function iniciarCadastro(email: string): Promise<{ segredo: string; legivel: string; uri: string }> {
  if (!mfaDisponivel()) {
    throw new Error(
      migracaoPendente
        ? "As tabelas do segundo fator não existem neste banco: rode `prisma migrate deploy`"
        : "AUTH_ENCRYPTION_KEY não configurada: não dá para cadastrar segundo fator",
    );
  }
  const alvo = normalizar(email);
  const atual = await buscar(alvo);
  if (atual?.confirmadoEm) throw new Error("Esta conta já tem verificação em duas etapas ativa");

  const segredo = gerarSegredo();
  const dados = { segredoEnc: cifrar(segredo), confirmadoEm: null, ultimoContador: null, ultimoUsoEm: null };
  const fator = await prisma.segundoFator.upsert({
    where: { email: alvo },
    create: { email: alvo, ...dados },
    update: dados,
  });
  // Códigos de um cadastro abandonado não valem para o segredo novo.
  await prisma.codigoBackup.deleteMany({ where: { fatorId: fator.id } });

  return { segredo, legivel: segredoLegivel(segredo), uri: uriOtpauth({ conta: alvo, segredo }) };
}

/**
 * Confirma o cadastro com um código do aplicativo e entrega os códigos de
 * recuperação — uma vez só, como a senha provisória do painel.
 */
export async function confirmarCadastro(
  email: string,
  codigo: string,
): Promise<{ ok: true; codigos: string[] } | { ok: false; erro: string }> {
  const fator = await buscar(email);
  if (!fator) return { ok: false, erro: "Comece o cadastro antes de confirmar." };
  if (fator.confirmadoEm) return { ok: false, erro: "Esta conta já tem verificação em duas etapas ativa." };

  const contador = verificarCodigo(decifrar(fator.segredoEnc), codigo, { minimoContador: null });
  if (contador === null) return { ok: false, erro: "Código incorreto. Confira o relógio do celular e tente o próximo." };

  await prisma.segundoFator.update({
    where: { id: fator.id },
    data: { confirmadoEm: new Date(), ultimoContador: BigInt(contador), ultimoUsoEm: new Date() },
  });
  return { ok: true, codigos: await gerarCodigos(fator.id) };
}

/**
 * O cadastro pendente desta conta, ou um novo.
 *
 * É o que as telas usam: recarregar a página do QR não pode trocar o segredo
 * debaixo de um aplicativo que já o leu. Segredo novo só quando não há cadastro
 * pendente nenhum.
 */
export async function obterOuIniciarCadastro(email: string): Promise<{ segredo: string; legivel: string; uri: string }> {
  const fator = await buscar(email);
  if (fator && !fator.confirmadoEm) {
    const segredo = decifrar(fator.segredoEnc);
    return { segredo, legivel: segredoLegivel(segredo), uri: uriOtpauth({ conta: normalizar(email), segredo }) };
  }
  return iniciarCadastro(email);
}

export type ResultadoVerificacao =
  | { ok: true; via: "totp" | "backup"; codigosRestantes: number }
  | { ok: false; motivo: "sem_fator" | "invalido" };

/**
 * Confere o código do desafio. Aceita o TOTP de 6 dígitos ou um código de
 * recuperação — quem perdeu o celular não fica sem caminho, e o código de
 * recuperação queima no uso.
 */
export async function verificar(email: string, codigo: string): Promise<ResultadoVerificacao> {
  const fator = await buscar(email);
  if (!fator?.confirmadoEm) return { ok: false, motivo: "sem_fator" };

  const limpo = codigo.trim();
  if (/^\d{6}$/.test(limpo.replace(/\s/g, ""))) {
    const contador = verificarCodigo(decifrar(fator.segredoEnc), limpo, {
      minimoContador: fator.ultimoContador === null ? null : Number(fator.ultimoContador),
    });
    if (contador !== null) {
      await prisma.segundoFator.update({
        where: { id: fator.id },
        data: { ultimoContador: BigInt(contador), ultimoUsoEm: new Date() },
      });
      return { ok: true, via: "totp", codigosRestantes: await restantes(fator.id) };
    }
    return { ok: false, motivo: "invalido" };
  }

  // Código de recuperação: o `updateMany` com `usadoEm: null` no filtro é o que
  // faz dois resgates simultâneos disputarem a linha — só um vence.
  const hash = hashCodigo(limpo);
  const consumido = await prisma.codigoBackup.updateMany({
    where: { fatorId: fator.id, codigoHash: hash, usadoEm: null },
    data: { usadoEm: new Date() },
  });
  if (consumido.count === 0) return { ok: false, motivo: "invalido" };

  await prisma.segundoFator.update({ where: { id: fator.id }, data: { ultimoUsoEm: new Date() } });
  return { ok: true, via: "backup", codigosRestantes: await restantes(fator.id) };
}

/** Novos códigos de recuperação; os antigos, usados ou não, deixam de valer. */
export async function regenerarCodigos(email: string): Promise<string[]> {
  const fator = await buscar(email);
  if (!fator?.confirmadoEm) throw new Error("Esta conta não tem verificação em duas etapas ativa");
  return gerarCodigos(fator.id);
}

/** Desliga o fator. Os códigos vão junto, pela cascata da chave estrangeira. */
export async function desativar(email: string): Promise<boolean> {
  const { count } = await prisma.segundoFator.deleteMany({ where: { email: normalizar(email) } });
  return count > 0;
}

/** Quem tem fator ativo, para a listagem do painel não fazer N consultas. */
export async function ativosPorEmail(): Promise<Set<string>> {
  if (migracaoPendente) return new Set();
  const linhas = await prisma.segundoFator
    .findMany({ where: { confirmadoEm: { not: null } }, select: { email: true } })
    .catch((erro) => {
      if (!migracaoFaltando(erro)) throw erro;
      marcarMigracaoPendente(erro);
      return [];
    });
  return new Set(linhas.map((l) => l.email));
}

// ------------------------------------------------------------------ apoio

function normalizar(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * O fator desta conta, ou nulo.
 *
 * Tabela ausente vira "não há fator" em vez de exceção: quem chama está no
 * meio de uma tela de login, e uma consulta que explode ali derruba a página
 * inteira. Erro de banco de verdade (conexão caída, permissão) continua
 * subindo — esse não pode virar silêncio.
 */
async function buscar(email: string) {
  if (migracaoPendente) return null;
  try {
    return await prisma.segundoFator.findUnique({ where: { email: normalizar(email) } });
  } catch (erro) {
    if (!migracaoFaltando(erro)) throw erro;
    marcarMigracaoPendente(erro);
    return null;
  }
}

function restantes(fatorId: string): Promise<number> {
  return prisma.codigoBackup.count({ where: { fatorId, usadoEm: null } });
}

/**
 * SHA-256 e não bcrypt: o código é sorteado com ~40 bits de entropia, não é
 * escolhido por gente. Não há dicionário a proteger, e o hash rápido é o mesmo
 * critério já usado no `CodigoTroca`.
 */
function hashCodigo(codigo: string): string {
  return createHash("sha256").update(normalizarCodigo(codigo)).digest("hex");
}

/** Aceita o código como a pessoa digitar: minúsculo, com ou sem o hífen. */
function normalizarCodigo(codigo: string): string {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function sortearCodigo(): string {
  const bloco = (n: number) => Array.from({ length: n }, () => ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)]).join("");
  return `${bloco(4)}-${bloco(4)}`;
}

async function gerarCodigos(fatorId: string): Promise<string[]> {
  await prisma.codigoBackup.deleteMany({ where: { fatorId } });
  const codigos = Array.from({ length: QUANTIDADE_CODIGOS }, sortearCodigo);
  await prisma.codigoBackup.createMany({
    data: codigos.map((c) => ({ fatorId, codigoHash: hashCodigo(c) })),
  });
  return codigos;
}
