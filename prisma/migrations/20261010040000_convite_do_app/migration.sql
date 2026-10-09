-- Convite emitido por um sistema (provisionamento) lembra de qual sistema veio,
-- para a pessoa cair nele depois de criar a senha.
ALTER TABLE "tokens_recuperacao" ADD COLUMN IF NOT EXISTS "app_id" TEXT;
