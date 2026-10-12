-- Endereço que o Auth avisa quando a pessoa sai (back-channel logout do OIDC).
-- Opcional: integração sem ele simplesmente não é avisada.
ALTER TABLE "clientes_oidc" ADD COLUMN IF NOT EXISTS "logout_uri" TEXT;
