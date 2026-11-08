BEGIN;
ALTER TABLE "codigos_oauth" ADD COLUMN "mcp_conexao_id" TEXT;
ALTER TABLE "refresh_oauth" ADD COLUMN "mcp_conexao_id" TEXT;
CREATE TABLE "mcp_clientes_publicos" (
  "cliente_id" TEXT PRIMARY KEY REFERENCES "clientes_oidc"("id") ON DELETE RESTRICT,
  "gateway_id" TEXT NOT NULL REFERENCES "clientes_oidc"("id") ON DELETE RESTRICT
);
CREATE TABLE "mcp_conexoes" (
  "id" TEXT PRIMARY KEY,
  "sub" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL REFERENCES "clientes_oidc"("id") ON DELETE RESTRICT,
  "organizacao_id" TEXT NOT NULL,
  "unidade_id" TEXT,
  "operacoes" TEXT[] NOT NULL,
  "recurso" TEXT NOT NULL DEFAULT 'https://mcp.avilaops.com/mcp',
  "pedido_hash" TEXT NOT NULL,
  "usado_em" TIMESTAMP(3),
  "revogado_em" TIMESTAMP(3),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "mcp_conexoes_sub_cliente_id_idx" ON "mcp_conexoes"("sub", "cliente_id");
CREATE TABLE "mcp_acessos_legados" (
  "token_hash" TEXT PRIMARY KEY,
  "familia" TEXT NOT NULL,
  "cliente_id" TEXT NOT NULL,
  "sub" TEXT NOT NULL,
  "expira_em" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "mcp_politicas_ferramenta" (
  "id" TEXT PRIMARY KEY,
  "cliente_id" TEXT NOT NULL REFERENCES "clientes_oidc"("id") ON DELETE RESTRICT,
  "ferramenta" TEXT NOT NULL,
  "recurso" TEXT NOT NULL DEFAULT 'https://mcp.avilaops.com/mcp',
  "operacao" TEXT NOT NULL CHECK ("operacao" IN ('read', 'write', 'delete')),
  "papeis" TEXT[] NOT NULL,
  "argumento_empresa" TEXT NOT NULL CHECK (length("argumento_empresa") > 0),
  "argumento_unidade" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX "mcp_politicas_ferramenta_cliente_id_ferramenta_key"
  ON "mcp_politicas_ferramenta"("cliente_id", "ferramenta");
CREATE TABLE "mcp_tokens_revogados" (
  "token_hash" TEXT PRIMARY KEY CHECK ("token_hash" ~ '^[a-f0-9]{64}$'),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMIT;
