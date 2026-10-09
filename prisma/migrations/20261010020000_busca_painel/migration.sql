-- Busca por CPF do painel guardada no servidor (cifrada, com validade).
CREATE TABLE IF NOT EXISTS "buscas_painel" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "secao" TEXT NOT NULL,
  "termo_enc" TEXT NOT NULL,
  "expira_em" TIMESTAMP(3) NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "buscas_painel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "buscas_painel_email_secao_idx" ON "buscas_painel"("email", "secao");
CREATE INDEX IF NOT EXISTS "buscas_painel_expira_em_idx" ON "buscas_painel"("expira_em");
