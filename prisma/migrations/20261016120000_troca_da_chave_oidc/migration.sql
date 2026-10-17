-- Troca da chave de assinatura do OIDC: cada chave diz desde quando assina.
-- A chave que já existe assina desde que nasceu.
ALTER TABLE "chaves_oidc" ADD COLUMN IF NOT EXISTS "assina_desde" TIMESTAMP(3);
UPDATE "chaves_oidc" SET "assina_desde" = "criada_em" WHERE "assina_desde" IS NULL;
ALTER TABLE "chaves_oidc" ALTER COLUMN "assina_desde" SET NOT NULL;
ALTER TABLE "chaves_oidc" ALTER COLUMN "assina_desde" SET DEFAULT CURRENT_TIMESTAMP;
