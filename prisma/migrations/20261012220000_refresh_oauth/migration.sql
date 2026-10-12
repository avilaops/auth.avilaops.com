-- Refresh token do provedor OIDC. Só o hash vai ao banco, como nos códigos de
-- autorização. "familia" liga os tokens que nasceram do mesmo login: cada
-- troca gasta um e emite outro, e o reuso de um já gasto derruba a família.
CREATE TABLE IF NOT EXISTS "refresh_oauth" (
  "id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "familia" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "sub" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "expira_em" TIMESTAMP(3) NOT NULL,
  "usado_em" TIMESTAMP(3),
  "revogado_em" TIMESTAMP(3),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_oauth_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "refresh_oauth_token_hash_key" ON "refresh_oauth"("token_hash");
CREATE INDEX IF NOT EXISTS "refresh_oauth_familia_idx" ON "refresh_oauth"("familia");
CREATE INDEX IF NOT EXISTS "refresh_oauth_sub_idx" ON "refresh_oauth"("sub");
CREATE INDEX IF NOT EXISTS "refresh_oauth_expira_em_idx" ON "refresh_oauth"("expira_em");
