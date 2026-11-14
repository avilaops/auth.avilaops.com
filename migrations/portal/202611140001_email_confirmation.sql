-- Banco das contas: emissão, consumo e estado do e-mail na mesma transação.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE portal_clients
  ADD COLUMN IF NOT EXISTS email_confirmacao_versao UUID NOT NULL DEFAULT gen_random_uuid();

CREATE TABLE IF NOT EXISTS portal_email_confirmacoes (
  token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  conta_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  versao UUID NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL,
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  janela_em TIMESTAMPTZ NOT NULL,
  envios INTEGER NOT NULL CHECK (envios BETWEEN 1 AND 3),
  CHECK (expira_em > criado_em)
);

CREATE OR REPLACE FUNCTION auth_invalida_confirmacao_email() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM portal_email_confirmacoes WHERE conta_id = OLD.id::text;
    RETURN OLD;
  END IF;
  IF lower(btrim(NEW.email)) IS DISTINCT FROM lower(btrim(OLD.email)) THEN
    NEW.email_verificado := false;
    NEW.mfa_email_ativo := false;
    NEW.mfa_email_bloqueado_ate := NULL;
    NEW.email_confirmacao_versao := gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auth_email_alterado ON portal_clients;
CREATE TRIGGER auth_email_alterado BEFORE UPDATE OF email ON portal_clients
FOR EACH ROW EXECUTE FUNCTION auth_invalida_confirmacao_email();
DROP TRIGGER IF EXISTS auth_conta_email_removida ON portal_clients;
CREATE TRIGGER auth_conta_email_removida AFTER DELETE ON portal_clients
FOR EACH ROW EXECUTE FUNCTION auth_invalida_confirmacao_email();
COMMIT;
