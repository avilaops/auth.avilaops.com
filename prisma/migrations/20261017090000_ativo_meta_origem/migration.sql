-- De onde veio o ativo da Meta: da leitura com o token da pessoa ("coleta") ou
-- do cadastro incorporado do WhatsApp ("cadastro_incorporado"). A leitura comum
-- só substitui o que ela mesma trouxe.
ALTER TABLE "ativos_meta" ADD COLUMN IF NOT EXISTS "origem" TEXT NOT NULL DEFAULT 'coleta';
