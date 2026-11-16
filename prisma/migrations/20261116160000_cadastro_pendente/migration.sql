-- Dados pessoais do cadastro próprio ficam no banco do Auth até a pessoa
-- confirmar o e-mail. O link carrega apenas o hash de um token aleatório.
CREATE TABLE "cadastros_pendentes" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "app_id" TEXT,
    "destino" TEXT,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "usado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cadastros_pendentes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cadastros_pendentes_token_hash_key" ON "cadastros_pendentes"("token_hash");
CREATE INDEX "cadastros_pendentes_email_idx" ON "cadastros_pendentes"("email");
CREATE INDEX "cadastros_pendentes_expira_em_idx" ON "cadastros_pendentes"("expira_em");
