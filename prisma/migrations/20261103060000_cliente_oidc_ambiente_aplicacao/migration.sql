-- A FK anterior verificava apenas se o ambiente existia. Um cliente podia
-- apontar para o ambiente de outro produto. Não corrige nem reatribui dados:
-- divergências devem ser identificadas pelo preflight e resolvidas pelo dono.
BEGIN;

CREATE UNIQUE INDEX "ambientes_aplicacao_id_aplicacao_id_key"
  ON "ambientes_aplicacao" ("id", "aplicacao_id");

ALTER TABLE "clientes_oidc"
  ADD CONSTRAINT "clientes_oidc_ambiente_aplicacao_fkey"
  FOREIGN KEY ("ambiente_id", "app_id")
  REFERENCES "ambientes_aplicacao" ("id", "aplicacao_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "clientes_oidc"
  DROP CONSTRAINT "clientes_oidc_ambiente_id_fkey";

COMMIT;
