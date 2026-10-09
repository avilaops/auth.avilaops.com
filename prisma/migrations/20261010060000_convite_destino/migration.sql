-- Para onde o convite leva a pessoa dentro do sistema que a convidou (a porta
-- de entrada dele). Sempre no host do próprio sistema; nulo = a raiz.
ALTER TABLE "tokens_recuperacao" ADD COLUMN IF NOT EXISTS "destino" TEXT;
