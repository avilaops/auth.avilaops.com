-- Shared Signals Framework (SSF), para provedores que pedem sinais de segurança
-- do login (o primeiro é o Apple Business).
--
-- Escopo concedido passa a ser guardado com o código e com o refresh token:
-- até aqui todo token valia "openid profile email" e o pedido era ignorado.
ALTER TABLE "codigos_oauth" ADD COLUMN IF NOT EXISTS "escopo" TEXT;
ALTER TABLE "refresh_oauth" ADD COLUMN IF NOT EXISTS "escopo" TEXT;
-- Integração autorizada a abrir um canal de sinais e recebê-los.
ALTER TABLE "clientes_oidc" ADD COLUMN IF NOT EXISTS "ssf" BOOLEAN NOT NULL DEFAULT false;

-- Canal de sinais de uma integração: para onde mandar e o que foi pedido.
CREATE TABLE IF NOT EXISTS "ssf_canais" (
  "id" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "endpoint_url" TEXT NOT NULL,
  "autorizacao_enc" TEXT,
  "eventos_pedidos" TEXT NOT NULL DEFAULT '[]',
  "descricao" TEXT,
  "status" TEXT NOT NULL DEFAULT 'enabled',
  "motivo" TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ssf_canais_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ssf_canais_cliente_id_key" ON "ssf_canais"("cliente_id");
