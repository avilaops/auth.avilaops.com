-- Segundo fator TOTP (RFC 6238) das contas.
--
-- Sem chave estrangeira para a conta: ela vive em `portal_clients`, em outro
-- banco, e o Postgres não faz FK entre bancos. A ligação é o e-mail, como em
-- `permissoes` e `eventos`.
CREATE TABLE "segundos_fatores" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "segredo_enc" TEXT NOT NULL,
    "confirmado_em" TIMESTAMP(3),
    "ultimo_contador" BIGINT,
    "ultimo_uso_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "segundos_fatores_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "segundos_fatores_email_key" ON "segundos_fatores"("email");

-- Códigos de recuperação de uso único. Só o hash.
CREATE TABLE "codigos_backup" (
    "id" TEXT NOT NULL,
    "fator_id" TEXT NOT NULL,
    "codigo_hash" TEXT NOT NULL,
    "usado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "codigos_backup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "codigos_backup_codigo_hash_key" ON "codigos_backup"("codigo_hash");
CREATE INDEX "codigos_backup_fator_id_idx" ON "codigos_backup"("fator_id");

ALTER TABLE "codigos_backup" ADD CONSTRAINT "codigos_backup_fator_id_fkey"
    FOREIGN KEY ("fator_id") REFERENCES "segundos_fatores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
