-- Fila de reenvio dos sinais de segurança: evento que o receptor não aceitou
-- na hora fica aqui até ser entregue ou vencer.
CREATE TABLE IF NOT EXISTS "ssf_pendentes" (
  "id" TEXT NOT NULL,
  "canal_id" TEXT NOT NULL,
  "set_jwt" TEXT NOT NULL,
  "tentativas" INTEGER NOT NULL DEFAULT 1,
  "proxima_em" TIMESTAMP(3) NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ssf_pendentes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ssf_pendentes_proxima_em_idx" ON "ssf_pendentes"("proxima_em");
CREATE INDEX IF NOT EXISTS "ssf_pendentes_canal_id_idx" ON "ssf_pendentes"("canal_id");

-- Onde uma rotina do próprio processo guarda até onde já olhou.
CREATE TABLE IF NOT EXISTS "rotinas_estado" (
  "chave" TEXT NOT NULL,
  "valor" TEXT NOT NULL,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rotinas_estado_pkey" PRIMARY KEY ("chave")
);
