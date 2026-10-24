/** Cada réplica tem seu pool; o total precisa caber no orçamento do PostgreSQL. */
export function configuracaoPoolPortal(env: Record<string, string | undefined> = process.env) {
  const inteiro = (nome: string, padrao: number, minimo: number, maximo: number) => {
    const valor = env[nome];
    if (valor === undefined || valor === "") return padrao;
    const numero = Number(valor);
    if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
      throw new Error(`${nome} precisa ser inteiro entre ${minimo} e ${maximo}`);
    }
    return numero;
  };
  return {
    max: inteiro("PORTAL_DB_POOL_MAX", 3, 1, 100),
    connectionTimeoutMillis: inteiro("PORTAL_DB_CONNECTION_TIMEOUT_MS", 10_000, 100, 120_000),
    idleTimeoutMillis: inteiro("PORTAL_DB_IDLE_TIMEOUT_MS", 30_000, 1000, 600_000),
  };
}
