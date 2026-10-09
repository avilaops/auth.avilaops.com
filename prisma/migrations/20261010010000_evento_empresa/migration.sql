-- Empresa registrada em cada evento da auditoria, daqui para frente.
-- Coluna opcional: os eventos que já existem ficam sem empresa, de propósito.
-- Preenchê-los com o vínculo de hoje seria inventar histórico.
ALTER TABLE "eventos" ADD COLUMN IF NOT EXISTS "organizacao_id" TEXT;
CREATE INDEX IF NOT EXISTS "eventos_organizacao_id_idx" ON "eventos"("organizacao_id");
