-- Remove o cadastro legado do Notas. O serviço, os workflows e as credenciais
-- correspondentes foram removidos da infraestrutura em 06/11/2026.
DELETE FROM "tokens_recuperacao"
WHERE "app_id" = 'notas';

DELETE FROM "permissoes"
WHERE "app_id" = 'notas';

DELETE FROM "eventos"
WHERE "app_id" = 'notas';

DELETE FROM "conferencias"
WHERE "app_id" = 'notas';

DELETE FROM "politicas_aplicacao"
WHERE "aplicacao_id" = 'notas';

DELETE FROM "codigos_oauth"
WHERE "cliente_id" IN (
  SELECT "id" FROM "clientes_oidc" WHERE "app_id" = 'notas'
);

DELETE FROM "refresh_oauth"
WHERE "cliente_id" IN (
  SELECT "id" FROM "clientes_oidc" WHERE "app_id" = 'notas'
);

DELETE FROM "ssf_canais"
WHERE "cliente_id" IN (
  SELECT "id" FROM "clientes_oidc" WHERE "app_id" = 'notas'
);

DELETE FROM "organizacoes_corporativas"
WHERE "cliente_id" IN (
  SELECT "id" FROM "clientes_oidc" WHERE "app_id" = 'notas'
);

DELETE FROM "redirect_uris"
WHERE "cliente_id" IN (
  SELECT "id" FROM "clientes_oidc" WHERE "app_id" = 'notas'
);

DELETE FROM "clientes_oidc"
WHERE "app_id" = 'notas';

DELETE FROM "ambientes_aplicacao"
WHERE "aplicacao_id" = 'notas';

DELETE FROM "aplicacoes"
WHERE "id" = 'notas';
