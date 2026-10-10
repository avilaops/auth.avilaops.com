-- Par de chaves que assina o `id_token` do provedor OIDC (RS256). A pública vai
-- para `/oauth/jwks`; a privada fica cifrada com `AUTH_ENCRYPTION_KEY`.
CREATE TABLE IF NOT EXISTS "chaves_oidc" (
  "kid" TEXT NOT NULL,
  "publica_jwk" TEXT NOT NULL,
  "privada_enc" TEXT NOT NULL,
  "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chaves_oidc_pkey" PRIMARY KEY ("kid")
);
