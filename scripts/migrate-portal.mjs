import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.PORTAL_DATABASE_URL;
if (!connectionString) {
  console.error("Migração do portal: PORTAL_DATABASE_URL não configurada.");
  process.exitCode = 1;
} else {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
  try {
    const sql = await readFile(new URL("../migrations/portal/202610290001_email_verification.sql", import.meta.url), "utf8");
    await client.connect();
    // Serializa inicializações concorrentes, com espera limitada. A migração
    // contém sua própria transação; fechar a sessão também libera o advisory lock.
    await client.query("SET statement_timeout = '30s'");
    await client.query("SELECT pg_advisory_lock(3010, 20261029)");
    await client.query(sql);
    console.log("Migração do portal concluída.");
  } catch {
    // Não registrar URL, credenciais ou detalhes de conexão vindos do driver.
    console.error("Migração do portal falhou; inicialização interrompida.");
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}
