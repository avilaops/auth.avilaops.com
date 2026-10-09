import { prisma } from "@/lib/prisma";

export type TipoEvento =
  | "login_ok"
  | "login_falhou"
  | "login_sem_permissao"
  | "logout"
  | "senha_trocada"
  | "senha_redefinida"
  | "recuperacao_emitida"
  | "recuperacao_usada"
  // Convite que o login escreveu a pedido de um sistema (provisionamento).
  | "convite_enviado"
  | "convite_nao_enviado"
  | "conta_criada"
  | "conta_editada"
  | "conta_removida"
  | "permissao_concedida"
  | "permissao_revogada"
  | "vinculo_criado"
  | "vinculo_removido"
  | "conector_alterado"
  // O cadastro de aplicações decide quem recebe sessão. Enquanto era código, a
  // revisão era o diff; agora o rastro de quem mexeu é este.
  | "app_criado"
  | "app_alterado"
  | "app_removido"
  // Conexão de ativos da Meta. O token guardado age em nome do cliente; quem
  // ligou, desligou e quando a Meta mandou apagar precisa ter rastro.
  | "meta_conectada"
  | "meta_desconectada"
  | "meta_falhou"
  | "meta_dados_excluidos"
  // Um sistema leu o token da Meta de um cliente. É o acesso mais sensível
  // que o auth concede a outro sistema; cada leitura deixa rastro.
  | "meta_token_entregue"
  | "meta_token_renovado"
  // Cadastro de integrações (clientes OIDC e de API) feito pelo painel.
  | "integracao_criada"
  | "integracao_alterada"
  | "integracao_segredo_trocado"
  | "integracao_removida"
  | "caixa_criada"
  | "caixa_falhou"
  // Verificação em duas etapas. `mfa_indisponivel` é o aviso de que a
  // exigência ficou suspensa por falta de `AUTH_ENCRYPTION_KEY` — sem ele, a
  // suspensão seria silenciosa, que é o pior jeito de perder um controle.
  | "mfa_ativado"
  | "mfa_desativado"
  | "mfa_resetado"
  | "mfa_desafiado"
  | "mfa_cadastro_exigido"
  | "mfa_ok"
  | "mfa_falhou"
  | "mfa_backup_usado"
  | "mfa_codigos_gerados"
  | "mfa_indisponivel";

export async function registrar(e: {
  tipo: TipoEvento;
  email?: string | null;
  appId?: string | null;
  ip?: string | null;
  detalhe?: string | null;
  autor?: string | null;
}): Promise<void> {
  try {
    await prisma.evento.create({
      data: {
        tipo: e.tipo,
        email: e.email?.toLowerCase() ?? null,
        appId: e.appId ?? null,
        ip: e.ip ?? null,
        detalhe: e.detalhe ?? null,
        autor: e.autor?.toLowerCase() ?? null,
      },
    });
  } catch (err) {
    // Auditoria não pode derrubar o login.
    console.error("evento não registrado", err);
  }
}

export async function listarEventos(opts: { email?: string; tipo?: string; antes?: Date; limite?: number } = {}) {
  return prisma.evento.findMany({
    where: {
      ...(opts.email ? { email: opts.email.toLowerCase() } : {}),
      ...(opts.tipo ? { tipo: opts.tipo } : {}),
      ...(opts.antes ? { criadoEm: { lt: opts.antes } } : {}),
    },
    orderBy: { criadoEm: "desc" },
    take: opts.limite ?? 200,
  });
}
/** Último login bem-sucedido de cada e-mail num app, para a ficha do app. */
export async function ultimosLoginsNoApp(appId: string): Promise<Map<string, Date>> {
  const rows = await prisma.evento.groupBy({
    by: ["email"],
    where: { tipo: "login_ok", appId, email: { not: null } },
    _max: { criadoEm: true },
  });
  const mapa = new Map<string, Date>();
  for (const r of rows) if (r.email && r._max.criadoEm) mapa.set(r.email, r._max.criadoEm);
  return mapa;
}

/** Último login bem-sucedido por e-mail, para a listagem de contas. */
export async function ultimosLogins(): Promise<Map<string, Date>> {
  const rows = await prisma.evento.groupBy({
    by: ["email"],
    where: { tipo: "login_ok", email: { not: null } },
    _max: { criadoEm: true },
  });
  const mapa = new Map<string, Date>();
  for (const r of rows) if (r.email && r._max.criadoEm) mapa.set(r.email, r._max.criadoEm);
  return mapa;
}

export type FiltroEventos = {
  busca?: string;
  tipos?: string[];
  apps?: string[];
  desde?: Date;
  /** Exclusivo. */
  ate?: Date;
  /** Só eventos até este instante: é o que mantém as páginas paradas enquanto chegam eventos novos. */
  referencia?: Date;
};

function ondeEventos(f: FiltroEventos) {
  const busca = f.busca?.trim();
  const limiteSuperior = [f.ate ? { lt: f.ate } : null, f.referencia ? { lte: f.referencia } : null].filter((v): v is { lt: Date } | { lte: Date } => v !== null);
  return {
    ...(f.tipos && f.tipos.length > 0 ? { tipo: { in: f.tipos } } : {}),
    ...(f.apps && f.apps.length > 0 ? { appId: { in: f.apps } } : {}),
    AND: [
      ...(f.desde ? [{ criadoEm: { gte: f.desde } }] : []),
      ...limiteSuperior.map((criadoEm) => ({ criadoEm })),
      ...(busca
        ? [{
            OR: [
              { email: { contains: busca, mode: "insensitive" as const } },
              { autor: { contains: busca, mode: "insensitive" as const } },
              { detalhe: { contains: busca, mode: "insensitive" as const } },
              { ip: { contains: busca } },
            ],
          }]
        : []),
    ],
  };
}

/**
 * Uma página da auditoria, com o total do recorte.
 *
 * Filtro, ordenação e corte acontecem no banco: a tabela só cresce. O
 * desempate por `id` deixa a ordem igual em toda consulta, e `referencia`
 * congela o conjunto no instante em que a pessoa abriu a listagem, para um
 * evento novo não empurrar linhas de uma página para a outra.
 */
export async function consultarEventos(f: FiltroEventos, opts: { pag: number; por: number; dir: "asc" | "desc" }) {
  const where = ondeEventos(f);
  const total = await prisma.evento.count({ where });
  const paginas = Math.max(1, Math.ceil(total / opts.por));
  const pag = Math.min(Math.max(1, opts.pag), paginas);
  const itens = await prisma.evento.findMany({
    where,
    orderBy: [{ criadoEm: opts.dir }, { id: opts.dir }],
    skip: (pag - 1) * opts.por,
    take: opts.por,
  });
  return { itens, total, pag, paginas, de: total === 0 ? 0 : (pag - 1) * opts.por + 1, ate: (pag - 1) * opts.por + itens.length };
}

/** Tipos e aplicações que de fato aparecem na auditoria, para montar os filtros. */
export async function facetasDosEventos(): Promise<{ tipos: string[]; apps: string[]; total: number }> {
  const [tipos, apps, total] = await Promise.all([
    prisma.evento.groupBy({ by: ["tipo"] }),
    prisma.evento.groupBy({ by: ["appId"], where: { appId: { not: null } } }),
    prisma.evento.count(),
  ]);
  return { tipos: tipos.map((t) => t.tipo), apps: apps.flatMap((a) => (a.appId ? [a.appId] : [])), total };
}
