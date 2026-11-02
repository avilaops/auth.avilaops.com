-- Destinos exatos para o retorno do end_session/logout OIDC.
ALTER TABLE "clientes_oidc"
  ADD COLUMN "post_logout_redirect_uris" TEXT NOT NULL DEFAULT '';
