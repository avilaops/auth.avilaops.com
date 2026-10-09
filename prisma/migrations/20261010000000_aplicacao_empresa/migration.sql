-- Empresa responsável por cada aplicação, para filtrar e agrupar o painel.
-- Coluna opcional e sem valor padrão: nenhuma linha existente muda, e o login
-- não lê este campo.
ALTER TABLE "aplicacoes" ADD COLUMN IF NOT EXISTS "organizacao_id" TEXT;
CREATE INDEX IF NOT EXISTS "aplicacoes_organizacao_id_idx" ON "aplicacoes"("organizacao_id");
