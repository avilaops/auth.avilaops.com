-- Última conferência de cada aplicação: o painel pede o endereço e guarda se
-- respondeu. Tabela própria, e não coluna em "aplicacoes", para o login (que lê
-- "aplicacoes" inteira) não depender desta migração ter rodado.
CREATE TABLE IF NOT EXISTS "conferencias" (
  "app_id" TEXT NOT NULL,
  "responde" BOOLEAN NOT NULL,
  "status" INTEGER,
  "detalhe" TEXT,
  "conferida_em" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conferencias_pkey" PRIMARY KEY ("app_id"),
  CONSTRAINT "conferencias_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "aplicacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
