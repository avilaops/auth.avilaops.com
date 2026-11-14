import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validarAmbienteLocal } from "../scripts/dev-local-config.mjs";

const env = {
  NODE_ENV: "development", SSO_BASE_URL: "http://127.0.0.1:3010",
  DATABASE_URL: "postgresql://dev:secret@127.0.0.1:55430/avila_auth_dev",
  PORTAL_DATABASE_URL: "postgresql://dev:secret@127.0.0.1:55430/avila_portal_dev",
  SSO_COOKIE_DOMAIN: "", AUTH_EMAIL_LOCAL: "1",
};

describe("ambiente DEV local", () => {
  it("aceita apenas o par de bancos DEV no loopback", () => {
    assert.doesNotThrow(() => validarAmbienteLocal(env));
    for (const campo of ["DATABASE_URL", "PORTAL_DATABASE_URL"]) {
      for (const valor of ["postgresql://dev:secret@db.example.test/avila_auth_dev", "postgresql://dev:secret@127.0.0.1/producao"]) {
        assert.throws(() => validarAmbienteLocal({ ...env, [campo]: valor }));
      }
    }
  });
  it("recusa produção, cookie compartilhado, serviços externos e base externa", () => {
    for (const extra of [
      { NODE_ENV: "production" }, { SSO_BASE_URL: "https://auth.avilaops.com" },
      { SSO_COOKIE_DOMAIN: ".avilaops.com" }, { MAIL_DATABASE_URL: env.DATABASE_URL },
      { N8N_CAIXA_WEBHOOK_TOKEN: "externo" }, { SMTP_HOST: "smtp.example.test" },
      { GOOGLE_CLIENT_ID: "externo" },
      { LOJAS_DATABASE_URL: env.DATABASE_URL },
    ]) assert.throws(() => validarAmbienteLocal({ ...env, ...extra }));
  });
});
