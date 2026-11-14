import { execFile, spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify, parseEnv } from "node:util";
import pg from "pg";
import bcrypt from "bcryptjs";
import { validarAmbienteLocal } from "./dev-local-config.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const local = path.join(raiz, ".local/auth");
const dados = path.join(local, "postgres");
const arquivoEnv = path.join(raiz, ".env.development.local");
const executar = promisify(execFile);
const existe = async (arquivo) => access(arquivo).then(() => true, () => false);
const segredo = () => randomBytes(32).toString("hex");
const binario = (pasta, nome) => pasta ? path.join(pasta, nome + (process.platform === "win32" ? ".exe" : "")) : nome;

async function pastaPostgres() {
  const pastas = [process.env.AUTH_DEV_PG_BIN];
  if (process.platform === "win32") {
    for (const base of [path.join(process.env.ProgramFiles || "C:/Program Files", "PostgreSQL"),
      path.join(process.env.LOCALAPPDATA || "", "PostgreSQL")]) {
      for (const versao of (await readdir(base).catch(() => [])).sort((a, b) => Number(b) - Number(a))) pastas.push(path.join(base, versao, "bin"));
    }
  }
  for (const pasta of [...pastas.filter(Boolean), ""]) {
    try { await executar(binario(pasta, "pg_ctl"), ["--version"], { windowsHide: true }); return pasta; } catch { /* Próxima instalação. */ }
  }
  throw new Error("Instale PostgreSQL 16+ (initdb/pg_ctl) ou informe AUTH_DEV_PG_BIN.");
}

async function lerAmbiente() {
  const env = { ...process.env, ...parseEnv(await readFile(arquivoEnv, "utf8")), NODE_ENV: "development" };
  validarAmbienteLocal(env);
  return env;
}

async function iniciarPostgres(env) {
  const pasta = await pastaPostgres();
  const url = new URL(env.DATABASE_URL);
  if (!await existe(path.join(dados, "PG_VERSION"))) {
    const senhaInicial = path.join(local, "postgres-init-password");
    await writeFile(senhaInicial, decodeURIComponent(url.password), { flag: "wx", mode: 0o600 });
    try {
      await executar(binario(pasta, "initdb"), ["-D", dados, "-U", decodeURIComponent(url.username), "--pwfile", senhaInicial,
        "--auth-host=scram-sha-256", "--auth-local=trust", "--encoding=UTF8", "--locale=C"], { windowsHide: true });
    } finally { await unlink(senhaInicial); }
  }
  const ativo = await executar(binario(pasta, "pg_ctl"), ["-D", dados, "status"], { windowsHide: true }).then(() => true, () => false);
  // Sem pipes herdados: no Windows o postgres persiste depois de pg_ctl terminar.
  if (!ativo) await new Promise((resolve, reject) => {
    const processo = spawn(binario(pasta, "pg_ctl"), ["-D", dados, "-l", path.join(local, "postgres.log"), "-w", "start",
      "-o", `-h 127.0.0.1 -p ${url.port || "55430"}`], { windowsHide: true, stdio: "ignore" });
    processo.on("error", reject);
    processo.on("exit", (code) => code === 0 ? resolve() : reject(new Error("pg_ctl recusou a inicialização; confira postgres.log.")));
  });
}

async function preparar() {
  await mkdir(local, { recursive: true, mode: 0o700 });
  if (!await existe(arquivoEnv)) {
    for (const nome of [".env", ".env.local"]) {
      if (await existe(path.join(raiz, nome))) throw new Error(`Já existe ${nome}. Preserve-o e use um checkout limpo para o DEV isolado.`);
    }
    const senhaBanco = segredo();
    const env = {
      DATABASE_URL: `postgresql://auth_dev:${senhaBanco}@127.0.0.1:55430/avila_auth_dev`,
      PORTAL_DATABASE_URL: `postgresql://auth_dev:${senhaBanco}@127.0.0.1:55430/avila_portal_dev`,
      SSO_BASE_URL: "http://127.0.0.1:3010", SSO_COOKIE_DOMAIN: "", SSO_JWT_SECRET: segredo(),
      AUTH_ENCRYPTION_KEY: segredo(), AUTH_EMAIL_LOCAL: "1", SSO_SUPERADMINS: "dev.admin@example.test",
      MFA_EQUIPE: "opcional", MFA_HABILITADO: "true", PORTAL_DB_POOL_MAX: "3",
    };
    await writeFile(arquivoEnv, Object.entries(env).map(([chave, valor]) => `${chave}=${JSON.stringify(valor)}`).join("\n") + "\n",
      { flag: "wx", mode: 0o600 });
  }
  const env = await lerAmbiente();
  await iniciarPostgres(env);
  const url = new URL(env.DATABASE_URL);
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.href });
  await admin.connect();
  try {
    for (const banco of ["avila_auth_dev", "avila_portal_dev"]) {
      if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [banco])).rowCount) await admin.query(`CREATE DATABASE ${banco}`);
    }
  } finally { await admin.end(); }
  console.log("PostgreSQL local pronto; aplicando migrações do Auth.");
  const migracao = await executar(process.execPath, [path.join(raiz, "node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { cwd: raiz, env, windowsHide: true, timeout: 120_000 });
  console.log(migracao.stdout);
  await executar(process.execPath, [path.join(raiz, "node_modules/prisma/build/index.js"), "generate"], { cwd: raiz, env, windowsHide: true, timeout: 60_000 });
  const portal = new pg.Client({ connectionString: env.PORTAL_DATABASE_URL });
  await portal.connect();
  try {
    await portal.query(`CREATE TABLE IF NOT EXISTS portal_clients (
      id text PRIMARY KEY, nome text NOT NULL, email text UNIQUE NOT NULL, cpf text, telefone text,
      role text NOT NULL DEFAULT 'CLIENT', senha_hash text NOT NULL, senha_provisoria boolean NOT NULL DEFAULT false,
      criado_em timestamp NOT NULL DEFAULT now(), atualizado_em timestamp NOT NULL DEFAULT now(), ativo boolean NOT NULL DEFAULT true,
      organization_id text, ultimo_acesso_em timestamp
    ); CREATE SCHEMA IF NOT EXISTS operations;
    CREATE TABLE IF NOT EXISTS operations.organizations (id uuid PRIMARY KEY, name text NOT NULL, status text)`);
    for (const nome of (await readdir(path.join(raiz, "migrations/portal"))).filter((n) => n.endsWith(".sql")).sort()) {
      await portal.query(await readFile(path.join(raiz, "migrations/portal", nome), "utf8"));
    }
    const arquivoAcesso = path.join(local, "access.json");
    if (!await existe(arquivoAcesso)) await writeFile(arquivoAcesso, JSON.stringify({ senha: segredo() }, null, 2), { flag: "wx", mode: 0o600 });
    const { senha } = JSON.parse(await readFile(arquivoAcesso, "utf8"));
    const hash = await bcrypt.hash(senha, 10);
    for (const [id, email, nome, role] of [
      ["dev-admin", "dev.admin@example.test", "Admin local", "OWNER"],
      ["dev-cliente", "dev@example.test", "Pessoa DEV", "CLIENT"],
      ["dev-sem-empresa", "dev.zero@example.test", "Sem empresa DEV", "CLIENT"],
      ["dev-bloqueado", "dev.blocked@example.test", "Vínculo bloqueado DEV", "CLIENT"],
    ]) await portal.query(`INSERT INTO portal_clients (id,email,nome,role,senha_hash,email_verificado)
      VALUES ($1,$2,$3,$4,$5,true) ON CONFLICT DO NOTHING`, [id, email, nome, role, hash]);
  } finally { await portal.end(); }
  Object.assign(process.env, env);
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    if (!await prisma.aplicacao.findUnique({ where: { id: "dev" } })) {
      // O catálogo de fábrica aponta para serviços publicados. Na primeira
      // preparação do banco sintético, não oferecê-los como destinos DEV.
      await prisma.aplicacao.updateMany({ data: { situacao: "planejado" } });
    }
    const app = await prisma.aplicacao.upsert({ where: { id: "dev" }, update: {}, create: {
      id: "dev", nome: "Consumidor DEV", host: "127.0.0.1:3011", login: true, situacao: "no_ar", restrito: false,
      politica: { create: { modoAcesso: "qualquer_conta", permiteCadastro: true, permiteRecuperacao: true } },
    } });
    const ambiente = await prisma.ambienteAplicacao.upsert({ where: { aplicacaoId_nome: { aplicacaoId: app.id, nome: "development" } },
      update: {}, create: { aplicacaoId: app.id, nome: "development", tipo: "development", dominio: "127.0.0.1:3011" } });
    const credenciais = JSON.parse(await readFile(path.join(local, "access.json"), "utf8"));
    if (!credenciais.clientSecret) {
      credenciais.clientSecret = segredo();
      await writeFile(path.join(local, "access.json"), JSON.stringify(credenciais, null, 2), { mode: 0o600 });
    }
    await prisma.clienteOidc.upsert({ where: { id: "dev-local" }, update: {}, create: {
      id: "dev-local", appId: app.id, ambienteId: ambiente.id, nome: "Consumidor local", redirectUris: "http://127.0.0.1:3011/callback",
      postLogoutRedirectUris: "http://127.0.0.1:3011/saiu", segredoHash: createHash("sha256").update(credenciais.clientSecret).digest("hex"),
      redirects: { create: [{ tipo: "authorization", uri: "http://127.0.0.1:3011/callback" }, { tipo: "post_logout", uri: "http://127.0.0.1:3011/saiu" }] },
    } });
    for (const [referencia, nome, contaId, situacao] of [
      ["dev-a", "Empresa Alfa DEV", "dev-cliente", "ATIVO"], ["dev-b", "Empresa Beta DEV", "dev-cliente", "ATIVO"],
      ["dev-suspensa", "Empresa suspensa DEV", "dev-bloqueado", "SUSPENSO"],
    ]) {
      const organizacao = await prisma.organizacaoCorporativa.upsert({ where: { clienteId_referenciaExterna: { clienteId: "dev-local", referenciaExterna: referencia } },
        update: {}, create: { clienteId: "dev-local", referenciaExterna: referencia, nome } });
      await prisma.vinculoCorporativo.upsert({ where: { organizacaoId_contaId: { organizacaoId: organizacao.id, contaId } }, update: {},
        create: { organizacaoId: organizacao.id, contaId, situacao, autorizacoes: { create: { papel: "COMPRADOR" } } } });
    }
  } finally { await prisma.$disconnect(); }
  console.log("DEV pronto: http://127.0.0.1:3010/login • dev@example.test ou dev.admin@example.test.");
  console.log("Senha e client secret: .local/auth/access.json. Mensagens: npm run dev:emails.");
}

async function main() {
  const acao = process.argv[2];
  if (acao === "setup") return preparar();
  if (acao === "emails") {
    const diretorio = path.join(local, "emails");
    const mensagens = await Promise.all((await readdir(diretorio).catch(() => [])).filter((n) => /^[\da-f-]+\.json$/.test(n))
      .map(async (nome) => JSON.parse(await readFile(path.join(diretorio, nome), "utf8"))));
    for (const m of mensagens.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))) console.log(`${m.criadoEm} • ${m.email.para} • ${m.email.assunto}\n${m.email.texto}\n`);
    if (!mensagens.length) console.log("Nenhuma mensagem local recebida.");
    return;
  }
  const env = await lerAmbiente();
  if (acao === "stop") {
    await executar(binario(await pastaPostgres(), "pg_ctl"), ["-D", dados, "-m", "fast", "-w", "stop"], { windowsHide: true });
    console.log("PostgreSQL DEV encerrado."); return;
  }
  if (acao !== "start") throw new Error("Use setup, start, stop ou emails.");
  for (const nome of [".env", ".env.local"]) if (await existe(path.join(raiz, nome))) throw new Error(`${nome} pode sobrepor o DEV; use checkout separado.`);
  await iniciarPostgres(env);
  const servidor = spawn(process.execPath, [path.join(raiz, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", new URL(env.SSO_BASE_URL).port || "3010"],
    { cwd: raiz, env, stdio: "inherit", windowsHide: true });
  servidor.on("error", () => { console.error("Não foi possível iniciar o Next DEV."); process.exitCode = 1; });
  servidor.on("exit", (code) => { process.exitCode = code ?? 1; });
  process.on("SIGINT", () => servidor.kill("SIGINT"));
  process.on("SIGTERM", () => servidor.kill("SIGTERM"));
}

main().catch(() => {
  console.error("Falha no DEV local. Confira PostgreSQL, arquivos locais e a configuração indicada em docs/DEV-LOCAL.md. URLs e credenciais foram omitidas.");
  process.exitCode = 1;
});
