CREATE TABLE "permissoes" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "concedido_por" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "permissoes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "permissoes_email_app_id_key" ON "permissoes"("email", "app_id");
CREATE INDEX "permissoes_email_idx" ON "permissoes"("email");

CREATE TABLE "eventos" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "email" TEXT,
    "app_id" TEXT,
    "ip" TEXT,
    "detalhe" TEXT,
    "autor" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eventos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "eventos_email_idx" ON "eventos"("email");
CREATE INDEX "eventos_criado_em_idx" ON "eventos"("criado_em");

CREATE TABLE "tokens_recuperacao" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "usado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tokens_recuperacao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tokens_recuperacao_token_hash_key" ON "tokens_recuperacao"("token_hash");
CREATE INDEX "tokens_recuperacao_email_idx" ON "tokens_recuperacao"("email");
