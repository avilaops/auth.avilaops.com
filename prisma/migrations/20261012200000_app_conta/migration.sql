-- conta.avilaops.com: a página da própria conta ganha endereço próprio, como
-- no mapa do ecossistema (o "myaccount" da casa). É o mesmo serviço do Auth,
-- atendendo em outro host; a linha aqui é o que deixa o login devolver a pessoa
-- para lá (`returnTo` só vale para host cadastrado).
INSERT INTO "aplicacoes"
  ("id", "host", "nome", "tipo", "login", "papel_exigido", "restrito", "repositorio", "servidor", "publicacao", "situacao", "observacao", "atualizado_por")
VALUES
  ('conta', 'conta.avilaops.com', 'Minha conta', 'app', true, NULL, false, 'avilaops/auth.avilaops.com', 'applications', 'container', 'no_ar', 'Mesmo serviço do Auth, em outro endereço.', 'migracao')
ON CONFLICT DO NOTHING;
