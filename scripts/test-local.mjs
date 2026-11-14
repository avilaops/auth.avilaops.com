/** Bancos exclusivos para as suítes destrutivas. Nunca usa os bancos de uso DEV. */
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { validarAmbienteLocal } from "./dev-local-config.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const env = { ...process.env, ...parseEnv(await readFile(path.join(raiz, ".env.development.local"), "utf8")), NODE_ENV: "development" };
validarAmbienteLocal(env);
const executar = (args, extra = {}) => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, args, { cwd: raiz, env: { ...env, ...extra }, stdio: "inherit", windowsHide: true });
  p.on("error", reject); p.on("exit", (code) => code === 0 ? resolve() : reject(new Error("Verificação local falhou.")));
});
const adminUrl = new URL(env.DATABASE_URL); adminUrl.pathname = "/postgres";
const admin = new pg.Client({ connectionString: adminUrl.href });
try {
  await admin.connect();
  if (!(await admin.query("SELECT pg_try_advisory_lock(3010, 20261113) AS ok")).rows[0].ok) throw new Error("Já há uma suíte local em execução.");
  await executar([path.join(raiz, "node_modules/prisma/build/index.js"), "generate"]);
  const base = ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "--import", "./tests/register.mjs", "--test", "--test-concurrency=1"];
  const suites = [
    { banco: "auth_contract_test", arquivos: ["tests/nucleoAuthBanco.test.ts", "tests/corporativoBanco.test.ts", "tests/acessosDaContaBanco.test.ts", "tests/conexoesDaContaBanco.test.ts", "tests/cadastroTransacaoBanco.test.ts"],
      variaveis: ["TEST_AUTH_DATABASE_URL", "TEST_DATABASE_URL", "TEST_CADASTRO_DATABASE_URL"], migrar: true },
    { banco: "auth_pagination_test", arquivos: ["tests/contasPaginadasBanco.test.ts", "tests/empresasPaginadasBanco.test.ts", "tests/contasEmailBanco.test.ts", "tests/fotoPerfilBanco.test.ts", "tests/confirmacaoEmailBanco.test.ts", "tests/portalMigration.test.mjs"],
      variaveis: ["TEST_PORTAL_DATABASE_URL"], migrar: false },
    { banco: "avl431_test", arquivos: ["tests/mcpBanco.test.ts"], variaveis: ["TEST_MCP_DATABASE_URL"], migrar: true },
  ];
  for (const suite of suites) {
    console.log(`\nBanco descartável: ${suite.banco}`);
    if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [suite.banco])).rowCount) await admin.query(`CREATE DATABASE ${suite.banco}`);
    const url = new URL(env.DATABASE_URL); url.pathname = `/${suite.banco}`;
    const sql = new pg.Client({ connectionString: url.href });
    await sql.connect();
    try { await sql.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS operations CASCADE"); }
    finally { await sql.end(); }
    const extra = { DATABASE_URL: url.href, ...Object.fromEntries(suite.variaveis.map((nome) => [nome, url.href])) };
    if (suite.migrar) await executar([path.join(raiz, "node_modules/prisma/build/index.js"), "migrate", "deploy"], extra);
    if (suite.banco === "auth_contract_test") {
      await executar([path.join(raiz, "node_modules/prisma/build/index.js"), "migrate", "diff", "--from-schema-datasource", "prisma/schema.prisma", "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"], extra);
      await executar(["scripts/preflight-aplicacoes.mjs"], extra);
    }
    await executar([...base, ...suite.arquivos], extra);
  }
  console.log("\nContratos, isolamento MCP, vínculos e persistência do portal verificados localmente.");
} catch {
  console.error("Falha na verificação local; confira o primeiro erro acima. Bancos DEV preservados."); process.exitCode = 1;
} finally { await admin.end(); }
