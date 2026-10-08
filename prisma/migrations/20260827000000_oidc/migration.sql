-- Código de autorização OAuth 2.0 / OIDC para aplicativo de terceiro.
--
-- Sem chave estrangeira de propósito: quem entra por senha é conta de
-- `portal_clients`, em outro banco, e o Postgres não faz FK entre bancos.
-- A identidade fica congelada nas colunas abaixo.
CREATE TABLE "codigos_oauth" (
    "id" TEXT NOT NULL,
    "codigo_hash" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "nonce" TEXT,
    "code_challenge" TEXT,
    "code_challenge_method" TEXT,
    "sub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "foto" TEXT,
    "papel" TEXT NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "usado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "codigos_oauth_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "codigos_oauth_codigo_hash_key" ON "codigos_oauth"("codigo_hash");
CREATE INDEX "codigos_oauth_expira_em_idx" ON "codigos_oauth"("expira_em");
