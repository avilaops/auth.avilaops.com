-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "foto" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_login" TIMESTAMP(3),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identidades" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "provedor" TEXT NOT NULL,
    "provedor_user_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codigos_troca" (
    "id" TEXT NOT NULL,
    "codigo_hash" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "usado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigos_troca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "identidades_usuario_id_idx" ON "identidades"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "identidades_provedor_provedor_user_id_key" ON "identidades"("provedor", "provedor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "codigos_troca_codigo_hash_key" ON "codigos_troca"("codigo_hash");

-- CreateIndex
CREATE INDEX "codigos_troca_usuario_id_idx" ON "codigos_troca"("usuario_id");

-- AddForeignKey
ALTER TABLE "identidades" ADD CONSTRAINT "identidades_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigos_troca" ADD CONSTRAINT "codigos_troca_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

