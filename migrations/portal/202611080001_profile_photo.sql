-- Foto pequena e normalizada da própria conta. Nenhum arquivo original é retido.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE portal_clients ADD COLUMN IF NOT EXISTS foto_perfil BYTEA;
COMMIT;
