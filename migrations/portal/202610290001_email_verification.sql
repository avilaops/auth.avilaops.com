-- Executar na conexão PORTAL_DATABASE_URL (cliente_portal), não em DATABASE_URL.
-- Aplicar antes de publicar o código que passa a selecionar estas colunas.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE portal_clients
  ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_email_ativo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_email_bloqueado_ate TIMESTAMP WITH TIME ZONE;

COMMIT;
