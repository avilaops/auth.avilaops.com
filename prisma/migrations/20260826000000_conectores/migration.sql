CREATE TABLE "conectores" (
    "id" TEXT NOT NULL,
    "ligado" BOOLEAN NOT NULL DEFAULT false,
    "client_id" TEXT,
    "client_secret_enc" TEXT,
    "extras" TEXT,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_por" TEXT,
    CONSTRAINT "conectores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vinculos" (
    "id" TEXT NOT NULL,
    "provedor" TEXT NOT NULL,
    "provedor_user_id" TEXT NOT NULL,
    "conta_id" TEXT NOT NULL,
    "email" TEXT,
    "nome" TEXT,
    "foto" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_login" TIMESTAMP(3),
    CONSTRAINT "vinculos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vinculos_provedor_provedor_user_id_key" ON "vinculos"("provedor", "provedor_user_id");
CREATE INDEX "vinculos_conta_id_idx" ON "vinculos"("conta_id");
