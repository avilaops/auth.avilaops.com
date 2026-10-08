-- Cadastro de aplicações e sites.
--
-- A lista de quem recebe sessão ficava fixa em `src/lib/apps.ts` e só mudava
-- com deploy. Passa a ser dado, editado no painel (`/admin/apps`).
CREATE TABLE "aplicacoes" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'app',
    "login" BOOLEAN NOT NULL DEFAULT false,
    "papel_exigido" TEXT,
    "restrito" BOOLEAN NOT NULL DEFAULT true,
    "exige_segundo_fator" BOOLEAN NOT NULL DEFAULT false,
    "dica_dominio_google" TEXT,
    "deep_link" TEXT,
    "repositorio" TEXT,
    "servidor" TEXT,
    "publicacao" TEXT,
    "situacao" TEXT NOT NULL DEFAULT 'planejado',
    "observacao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_por" TEXT,
    CONSTRAINT "aplicacoes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "aplicacoes_host_key" ON "aplicacoes"("host");

-- Os 13 apps que estavam em `apps.ts`, com as mesmas regras de acesso: mesmo
-- id, mesmo host, mesmo papel exigido, nenhum restrito. Quem entrava continua
-- entrando e quem não entrava continua fora: esta migração não muda login
-- nenhum. A situação é a medida em 06/10/2026 (resposta HTTP de cada host).
INSERT INTO "aplicacoes"
  ("id", "host", "nome", "tipo", "login", "papel_exigido", "restrito", "deep_link", "repositorio", "servidor", "publicacao", "situacao", "observacao", "atualizado_por")
VALUES
  ('app', 'app.avilaops.com', 'Avila Ops — Operação', 'app', true, 'ADMIN', false, NULL, 'avilaops/app.avilaops.com', 'applications', 'container', 'fora_do_ar', 'Container removido em 05/10/2026.', 'migracao'),
  ('agricola', 'agricola.avilaops.com', 'Avila Agrícola', 'app', true, NULL, false, NULL, NULL, NULL, NULL, 'fora_do_ar', 'Sem registro de DNS em 06/10/2026.', 'migracao'),
  ('crm', 'crm.avilaops.com', 'CRM', 'app', true, NULL, false, NULL, 'avilaops/crm.avilaops.com', NULL, NULL, 'no_ar', 'Respondia 200 em 06/10/2026; servidor de origem não conferido.', 'migracao'),
  ('docs', 'docs.avilaops.com', 'Documentação', 'app', true, NULL, false, NULL, 'avilaops/docs.avilaops.com', NULL, NULL, 'fora_do_ar', 'DNS existe, sem servidor atrás (525) em 06/10/2026.', 'migracao'),
  ('engops', 'engops.avilaops.com', 'EngOps', 'app', true, NULL, false, NULL, 'avilaops/engops.avilaops.com', 'apps-noclient', 'container', 'fora_do_ar', 'Container removido em 05/10/2026.', 'migracao'),
  ('erp', 'erp.avilaops.com', 'ERP', 'app', true, NULL, false, NULL, 'avilaops/ERP', NULL, NULL, 'planejado', 'Endereço herdado da lista original; o domínio definitivo não foi decidido.', 'migracao'),
  ('irlquest', 'irlquest.avilaops.com', 'IRL Quest', 'app', true, NULL, false, 'irlquest://auth/callback', 'avilaops/irlquest.avilaops.com', NULL, NULL, 'fora_do_ar', 'Sem registro de DNS em 06/10/2026.', 'migracao'),
  ('jobs', 'jobs.avilaops.com', 'Jobs', 'app', true, NULL, false, NULL, 'avilaops/jobs.avilaops.com', 'applications', 'estatico', 'no_ar', NULL, 'migracao'),
  ('mail', 'mail.avilaops.com', 'Webmail', 'app', true, NULL, false, NULL, 'avilaops/mail.avilaops.com', 'applications', 'systemd', 'no_ar', NULL, 'migracao'),
  ('n8n', 'n8n.avilaops.com', 'n8n — Automações Ávila Ops', 'app', true, 'ADMIN', false, NULL, 'avilaops/n8n.avilaops.com', 'apps-noclient', 'container', 'fora_do_ar', 'Container removido em 05/10/2026.', 'migracao'),
  ('comandeiro', 'app.comandeiro.com.br', 'Comandeiro', 'app', true, NULL, false, NULL, 'avilaops/app.comandeiro.com.br', 'applications', 'container', 'fora_do_ar', 'Respondia 502 em 06/10/2026.', 'migracao'),
  ('minas', 'minas.avilaops.com', 'Minas', 'app', true, NULL, false, NULL, NULL, NULL, NULL, 'fora_do_ar', 'Host antigo do Comandeiro. Sem registro de DNS em 06/10/2026.', 'migracao'),
  ('notas', 'notas.avilaops.com', 'Notas', 'app', true, 'ADMIN', false, NULL, 'avilaops/notas.avilaops.com', 'apps-noclient', 'container', 'fora_do_ar', 'Container removido em 05/10/2026. Entra por OIDC, não por cookie.', 'migracao');

-- O que existe e não recebe sessão do login único: sites estáticos e produtos
-- com login próprio. Não estavam em lista nenhuma; o levantamento é o de
-- 06/10/2026, lido do Caddy e dos arquivos de deploy do servidor.
INSERT INTO "aplicacoes"
  ("id", "host", "nome", "tipo", "login", "repositorio", "servidor", "publicacao", "situacao", "observacao", "atualizado_por")
VALUES
  ('avilaops-com', 'avilaops.com', 'Site Ávila Ops', 'site', false, 'avilaops/avilaops-site', 'applications', 'estatico', 'no_ar', NULL, 'migracao'),
  ('gabrielarincao-com-br', 'gabrielarincao.com.br', 'Gabriela Rincão', 'site', false, 'avilaops/gabrielarincao.com.br', 'applications', 'estatico', 'no_ar', NULL, 'migracao'),
  ('maprojetos-com-br', 'maprojetos.com.br', 'MA Projetos', 'site', false, 'avilaops/maprojetos.com.br', 'applications', 'estatico', 'no_ar', NULL, 'migracao'),
  ('seteeseteengenharia-com-br', 'seteeseteengenharia.com.br', 'Sete e Sete Engenharia', 'site', false, 'avilaops/seteeseteengenharia.com.br', 'applications', 'estatico', 'no_ar', NULL, 'migracao'),
  ('comandeiro-com', 'comandeiro.com', 'Comandeiro (site .com)', 'site', false, 'avilaops/comandeiro.com', 'applications', 'estatico', 'no_ar', 'Pasta fixa em /var/www, fora do deploy automático.', 'migracao'),
  ('comandeiro-com-br', 'comandeiro.com.br', 'Comandeiro (site .com.br)', 'site', false, 'avilaops/comandeiro.com.br', 'applications', 'estatico', 'no_ar', 'Pasta fixa em /var/www, fora do deploy automático.', 'migracao'),
  ('tuitecnologia-com-br', 'tuitecnologia.com.br', 'Tuí Tecnologia', 'site', false, 'avilaops/tuitecnologia.com.br', 'apps-noclient', 'estatico', 'fora_do_ar', 'Pasta removida do servidor em 05/10/2026.', 'migracao'),
  ('auth-avilaops-com', 'auth.avilaops.com', 'Login único', 'app', false, 'avilaops/auth.avilaops.com', 'applications', 'container', 'no_ar', 'Este painel.', 'migracao'),
  ('lojas-avilaops-com', 'lojas.avilaops.com', 'Lojas', 'app', false, 'avilaops/lojas.avilaops.com', 'applications', 'container', 'no_ar', 'Login próprio. As lojas de cliente ficam no cadastro do próprio Lojas.', 'migracao'),
  ('saudepet-app-br', 'saudepet.app.br', 'Saúde Pet', 'app', false, 'avilaops/saudepet.app.br', 'applications', 'container', 'no_ar', 'Login próprio.', 'migracao');
