-- Política de acesso separada do catálogo de aplicações.

CREATE TABLE "politicas_aplicacao" (
  "id" TEXT NOT NULL,
  "aplicacao_id" TEXT NOT NULL,
  "modo_acesso" TEXT NOT NULL DEFAULT 'restrito',
  "exige_mfa" BOOLEAN NOT NULL DEFAULT false,
  "permite_cadastro" BOOLEAN NOT NULL DEFAULT true,
  "permite_recuperacao" BOOLEAN NOT NULL DEFAULT true,
  "convite_obrigatorio" BOOLEAN NOT NULL DEFAULT false,
  "empresa_obrigatoria" BOOLEAN NOT NULL DEFAULT false,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_por" TEXT,
  CONSTRAINT "politicas_aplicacao_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "politicas_aplicacao_aplicacao_id_key" UNIQUE ("aplicacao_id"),
  CONSTRAINT "politicas_aplicacao_aplicacao_id_fkey" FOREIGN KEY ("aplicacao_id") REFERENCES "aplicacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "politicas_aplicacao" (
  "id", "aplicacao_id", "modo_acesso", "exige_mfa", "permite_cadastro", "permite_recuperacao"
)
SELECT
  'pol-' || md5(a."id"),
  a."id",
  CASE
    WHEN a."login" = false OR a."tipo" <> 'app' OR a."situacao" = 'desativado' THEN 'desativado'
    WHEN a."papel_exigido" = 'ADMIN' THEN 'equipe'
    WHEN a."restrito" = true THEN 'clientes_liberados'
    ELSE 'qualquer_conta'
  END,
  a."exige_segundo_fator",
  true,
  true
FROM "aplicacoes" a
ON CONFLICT ("aplicacao_id") DO NOTHING;
