-- Núcleo v1: separa ambiente e destinos OIDC do catálogo de aplicações.
-- A coluna textual redirect_uris permanece durante a migração dos consumidores.

CREATE TABLE "ambientes_aplicacao" (
  "id" TEXT NOT NULL,
  "aplicacao_id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "tipo" TEXT NOT NULL DEFAULT 'producao',
  "dominio" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ambientes_aplicacao_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ambientes_aplicacao_aplicacao_id_fkey" FOREIGN KEY ("aplicacao_id") REFERENCES "aplicacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ambientes_aplicacao_aplicacao_id_nome_key" ON "ambientes_aplicacao"("aplicacao_id", "nome");
CREATE INDEX "ambientes_aplicacao_aplicacao_id_ativo_idx" ON "ambientes_aplicacao"("aplicacao_id", "ativo");

ALTER TABLE "clientes_oidc" ADD COLUMN "ambiente_id" TEXT;
CREATE INDEX "clientes_oidc_ambiente_id_idx" ON "clientes_oidc"("ambiente_id");
ALTER TABLE "clientes_oidc" ADD CONSTRAINT "clientes_oidc_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "aplicacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clientes_oidc" ADD CONSTRAINT "clientes_oidc_ambiente_id_fkey" FOREIGN KEY ("ambiente_id") REFERENCES "ambientes_aplicacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "redirect_uris" (
  "id" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "tipo" TEXT NOT NULL DEFAULT 'authorization',
  "uri" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "redirect_uris_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "redirect_uris_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes_oidc"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "redirect_uris_cliente_id_tipo_uri_key" ON "redirect_uris"("cliente_id", "tipo", "uri");
CREATE INDEX "redirect_uris_cliente_id_tipo_ativo_idx" ON "redirect_uris"("cliente_id", "tipo", "ativo");

INSERT INTO "ambientes_aplicacao" ("id", "aplicacao_id", "nome", "tipo", "dominio")
SELECT 'amb-' || md5(a."id"), a."id", 'produção', 'producao', a."host"
FROM "aplicacoes" a
ON CONFLICT ("aplicacao_id", "nome") DO NOTHING;

UPDATE "clientes_oidc" c
SET "ambiente_id" = a."id"
FROM "ambientes_aplicacao" a
WHERE a."aplicacao_id" = c."app_id" AND a."nome" = 'produção' AND c."ambiente_id" IS NULL;

INSERT INTO "redirect_uris" ("id", "cliente_id", "tipo", "uri")
SELECT 'redir-' || md5(c."id" || ':' || u), c."id", 'authorization', u
FROM "clientes_oidc" c
CROSS JOIN LATERAL regexp_split_to_table(c."redirect_uris", E'\\r?\\n') AS u
WHERE trim(u) <> ''
ON CONFLICT ("cliente_id", "tipo", "uri") DO NOTHING;
