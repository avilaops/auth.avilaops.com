-- Conexão de contas com a Meta (Facebook, Instagram, WhatsApp, anúncios).
--
-- Sem chave estrangeira para a conta: ela vive em `portal_clients`, em outro
-- banco. A ligação é `conta_id`, como em `vinculos`.
CREATE TABLE "conexoes_meta" (
    "id" TEXT NOT NULL,
    "conta_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fb_user_id" TEXT NOT NULL,
    "nome" TEXT,
    "token_enc" TEXT NOT NULL,
    "escopos" TEXT NOT NULL DEFAULT '',
    "recusados" TEXT NOT NULL DEFAULT '',
    "expira_em" TIMESTAMP(3),
    "sincronizado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conexoes_meta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "conexoes_meta_conta_id_key" ON "conexoes_meta"("conta_id");
CREATE INDEX "conexoes_meta_fb_user_id_idx" ON "conexoes_meta"("fb_user_id");

-- Ativos alcançados pela conexão. O token da Página vai cifrado.
CREATE TABLE "ativos_meta" (
    "id" TEXT NOT NULL,
    "conexao_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "externo_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "detalhe" TEXT,
    "token_enc" TEXT,
    "sincronizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ativos_meta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ativos_meta_conexao_id_tipo_externo_id_key" ON "ativos_meta"("conexao_id", "tipo", "externo_id");

ALTER TABLE "ativos_meta" ADD CONSTRAINT "ativos_meta_conexao_id_fkey"
    FOREIGN KEY ("conexao_id") REFERENCES "conexoes_meta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Comprovante de pedido de exclusão de dados. Só o código e a hora.
CREATE TABLE "exclusoes_meta" (
    "codigo" TEXT NOT NULL,
    "concluida_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exclusoes_meta_pkey" PRIMARY KEY ("codigo")
);
