CREATE TABLE "organizacoes_corporativas" (
  "id" UUID NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "referencia_externa" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "situacao" TEXT NOT NULL DEFAULT 'ATIVO',
  "versao" INTEGER NOT NULL DEFAULT 1,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizacoes_corporativas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organizacoes_corporativas_situacao_check" CHECK ("situacao" IN ('ATIVO', 'SUSPENSO', 'REVOGADO')),
  CONSTRAINT "organizacoes_corporativas_versao_check" CHECK ("versao" > 0)
);

CREATE TABLE "unidades_corporativas" (
  "id" UUID NOT NULL,
  "organizacao_id" UUID NOT NULL,
  "referencia_externa" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "situacao" TEXT NOT NULL DEFAULT 'ATIVO',
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "unidades_corporativas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "unidades_corporativas_situacao_check" CHECK ("situacao" IN ('ATIVO', 'SUSPENSO', 'REVOGADO'))
);

CREATE TABLE "vinculos_corporativos" (
  "id" UUID NOT NULL,
  "organizacao_id" UUID NOT NULL,
  "conta_id" TEXT NOT NULL,
  "situacao" TEXT NOT NULL DEFAULT 'ATIVO',
  "convidado_por" TEXT,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revogado_em" TIMESTAMP(3),
  CONSTRAINT "vinculos_corporativos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vinculos_corporativos_situacao_check" CHECK ("situacao" IN ('ATIVO', 'SUSPENSO', 'REVOGADO'))
);

CREATE TABLE "autorizacoes_corporativas" (
  "id" UUID NOT NULL,
  "vinculo_id" UUID NOT NULL,
  "unidade_id" UUID,
  "papel" TEXT NOT NULL,
  "limite_aprovacao_centavos" INTEGER,
  "moeda" TEXT NOT NULL DEFAULT 'BRL',
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "autorizacoes_corporativas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "autorizacoes_corporativas_papel_check" CHECK ("papel" IN ('ADMINISTRADOR', 'COMPRADOR', 'APROVADOR', 'FINANCEIRO', 'VENDEDOR')),
  CONSTRAINT "autorizacoes_corporativas_limite_check" CHECK ("limite_aprovacao_centavos" IS NULL OR "limite_aprovacao_centavos" >= 0),
  CONSTRAINT "autorizacoes_corporativas_moeda_check" CHECK ("moeda" = 'BRL')
);

CREATE UNIQUE INDEX "organizacoes_corporativas_cliente_id_referencia_externa_key" ON "organizacoes_corporativas"("cliente_id", "referencia_externa");
CREATE INDEX "organizacoes_corporativas_cliente_id_situacao_idx" ON "organizacoes_corporativas"("cliente_id", "situacao");
CREATE UNIQUE INDEX "unidades_corporativas_organizacao_id_referencia_externa_key" ON "unidades_corporativas"("organizacao_id", "referencia_externa");
CREATE INDEX "unidades_corporativas_organizacao_id_situacao_idx" ON "unidades_corporativas"("organizacao_id", "situacao");
CREATE UNIQUE INDEX "vinculos_corporativos_organizacao_id_conta_id_key" ON "vinculos_corporativos"("organizacao_id", "conta_id");
CREATE INDEX "vinculos_corporativos_conta_id_situacao_idx" ON "vinculos_corporativos"("conta_id", "situacao");
CREATE INDEX "autorizacoes_corporativas_vinculo_id_idx" ON "autorizacoes_corporativas"("vinculo_id");
CREATE INDEX "autorizacoes_corporativas_unidade_id_idx" ON "autorizacoes_corporativas"("unidade_id");
CREATE UNIQUE INDEX "autorizacoes_corporativas_organizacao_key" ON "autorizacoes_corporativas"("vinculo_id", "papel") WHERE "unidade_id" IS NULL;
CREATE UNIQUE INDEX "autorizacoes_corporativas_unidade_key" ON "autorizacoes_corporativas"("vinculo_id", "unidade_id", "papel") WHERE "unidade_id" IS NOT NULL;

ALTER TABLE "unidades_corporativas" ADD CONSTRAINT "unidades_corporativas_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes_corporativas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vinculos_corporativos" ADD CONSTRAINT "vinculos_corporativos_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes_corporativas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "autorizacoes_corporativas" ADD CONSTRAINT "autorizacoes_corporativas_vinculo_id_fkey" FOREIGN KEY ("vinculo_id") REFERENCES "vinculos_corporativos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "autorizacoes_corporativas" ADD CONSTRAINT "autorizacoes_corporativas_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidades_corporativas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
