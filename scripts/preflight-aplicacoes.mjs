import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Preflight de aplicações: DATABASE_URL não configurada.");
  process.exit(2);
}

const client = new pg.Client({ connectionString });
try {
  await client.connect();
  const tabelas = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_name = any($1::text[])
  `, [["aplicacoes", "clientes_oidc"]]);
  const presentes = new Set(tabelas.rows.map((row) => row.table_name));
  const ausentes = ["aplicacoes", "clientes_oidc"].filter((nome) => !presentes.has(nome));
  if (ausentes.length) {
    console.error(`Preflight de aplicações: tabelas ausentes: ${ausentes.join(", ")}`);
    process.exitCode = 1;
  } else {
    const orfaos = await client.query(`
      select count(*)::int as total
      from clientes_oidc c
      left join aplicacoes a on a.id = c.app_id
      where a.id is null
    `);
    const total = orfaos.rows[0].total;
    if (total > 0) {
      console.error(`Preflight de aplicações: ${total} cliente(s) OIDC sem aplicação vinculada.`);
      process.exitCode = 1;
    } else {
      console.log("Preflight de aplicações: tabelas presentes e nenhuma referência OIDC órfã.");
    }
  }
} catch (error) {
  console.error("Preflight de aplicações: não foi possível consultar o banco.", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
