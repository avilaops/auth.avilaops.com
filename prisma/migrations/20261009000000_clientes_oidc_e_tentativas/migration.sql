-- Clientes OIDC cadastrados pelo painel e contador do limite de tentativas.
-- Gerado por `prisma migrate diff` a partir do schema.
-- CreateTable
CREATE TABLE "clientes_oidc" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "redirect_uris" TEXT NOT NULL,
    "segredo_hash" TEXT NOT NULL,
    "acesso_meta" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_por" TEXT,

    CONSTRAINT "clientes_oidc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tentativas" (
    "chave" TEXT NOT NULL,
    "conta" INTEGER NOT NULL DEFAULT 1,
    "reinicia_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tentativas_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE INDEX "clientes_oidc_app_id_idx" ON "clientes_oidc"("app_id");

-- CreateIndex
CREATE INDEX "tentativas_reinicia_em_idx" ON "tentativas"("reinicia_em");


