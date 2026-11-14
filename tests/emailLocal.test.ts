import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { emailLocalHabilitado, gravarEmailLocal } from "@/lib/emailLocal";
import { emailConfigurado, enviarEmail } from "@/lib/email";

describe("captura local de e-mail", () => {
  const env = { NODE_ENV: "development", AUTH_EMAIL_LOCAL: "1", SSO_BASE_URL: "http://127.0.0.1:3010" };
  it("exige ativação explícita, development e base em loopback", () => {
    assert.equal(emailLocalHabilitado(env), true);
    for (const extra of [{ NODE_ENV: "production" }, { NODE_ENV: "test" }, { AUTH_EMAIL_LOCAL: "0" },
      { SSO_BASE_URL: "https://auth.avilaops.com" }, { SSO_BASE_URL: "http://127.0.0.1.evil.test" },
      { SSO_BASE_URL: "invalida" }]) assert.equal(emailLocalHabilitado({ ...env, ...extra }), false);
  });
  it("grava mensagem completa com nome próprio, sem caminho derivado do destinatário", async () => {
    const diretorio = await mkdtemp(path.join(tmpdir(), "auth-email-"));
    try {
      const email = { para: "../../pessoa@example.test", assunto: "Confirmação", texto: "Link local", html: "<p>Link local</p>" };
      const { messageId } = await gravarEmailLocal(email, diretorio);
      const arquivos = await readdir(diretorio);
      assert.deepEqual(arquivos, [`${messageId}.json`]);
      const gravado = JSON.parse(await readFile(path.join(diretorio, arquivos[0]), "utf8"));
      assert.deepEqual(gravado.email, email);
      assert.equal(gravado.messageId, messageId);
      assert.ok(Number.isFinite(Date.parse(gravado.criadoEm)));
    } finally { await rm(diretorio, { recursive: true, force: true }); }
  });
  it("o envio normal usa a captura em DEV e não a habilita em produção", async () => {
    const diretorio = await mkdtemp(path.join(tmpdir(), "auth-transporte-"));
    const anterior = { ...process.env };
    const cwd = process.cwd();
    try {
      process.chdir(diretorio);
      for (const nome of ["SMTP_HOST", "SMTP_USUARIO", "SMTP_SENHA", "EMAIL_REMETENTE", "N8N_CAIXA_WEBHOOK_TOKEN"]) delete process.env[nome];
      Object.assign(process.env, env);
      assert.equal(emailConfigurado(), true);
      await enviarEmail({ para: "local@example.test", assunto: "Cadastro", texto: "Mensagem de teste" });
      const arquivos = await readdir(path.join(diretorio, ".local/auth/emails"));
      assert.equal(arquivos.length, 1);
      Object.assign(process.env, { NODE_ENV: "production" });
      assert.equal(emailConfigurado(), false);
      await assert.rejects(enviarEmail({ para: "local@example.test", assunto: "Produção", texto: "Não capturar" }), /não configurado/);
      assert.equal((await readdir(path.join(diretorio, ".local/auth/emails"))).length, 1);
    } finally {
      process.chdir(cwd);
      for (const nome of Object.keys(process.env)) if (!(nome in anterior)) delete process.env[nome];
      Object.assign(process.env, anterior);
      await rm(diretorio, { recursive: true, force: true });
    }
  });
});
