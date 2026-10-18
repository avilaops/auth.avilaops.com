ALTER TABLE "vinculos_corporativos"
ADD COLUMN "ultima_intencao_versao" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "vinculos_corporativos_intencao_versao_check" CHECK ("ultima_intencao_versao" >= 0);

ALTER TABLE "organizacoes_corporativas"
ADD COLUMN "ultima_intencao_versao" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "provisionamento_v2" BOOLEAN NOT NULL DEFAULT false,
ADD CONSTRAINT "organizacoes_corporativas_intencao_versao_check" CHECK ("ultima_intencao_versao" >= 0);
