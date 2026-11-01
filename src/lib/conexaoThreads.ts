import { poolPortal } from "@/lib/contas";

export type LinhaThreads = {
  account_name: string | null;
  status: string;
  scopes: unknown;
  token_expires_at: Date | null;
  last_synced_at: Date | null;
};

/** Metadados para o titular. Nunca seleciona ou descriptografa a credencial. */
export function resumoThreads(linha: LinhaThreads | undefined, agora = new Date()) {
  if (!linha) return null;
  const conectada = linha.status === "ACTIVE" && Boolean(linha.token_expires_at && linha.token_expires_at > agora);
  const escopos = Array.isArray(linha.scopes) ? linha.scopes : [];
  return { nome: linha.account_name, conectada, expiraEm: linha.token_expires_at, conferidaEm: linha.last_synced_at,
    publicar: conectada && escopos.includes("threads_content_publish"), resultados: conectada && escopos.includes("threads_manage_insights") };
}

export async function buscarThreadsDaConta(contaId: string) {
  // Revalida o vínculo persistido e a atividade do titular no mesmo SELECT.
  // Não aceita organizationId vindo do navegador nem usa e-mail como autorização.
  const { rows } = await poolPortal().query<LinhaThreads>(`
    SELECT c.account_name, c.status, c.scopes, c.token_expires_at, c.last_synced_at
    FROM public.portal_clients p
    JOIN operations.organizations o ON o.id = p.organization_id AND o.status <> 'ARCHIVED'
    JOIN operations.organization_integration_connections c ON c.organization_id = o.id AND c.provider = 'threads_login'
    WHERE p.id = $1 AND p.ativo = true
    LIMIT 1`, [contaId]);
  return resumoThreads(rows[0]);
}
