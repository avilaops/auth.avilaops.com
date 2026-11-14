# Auth DEV local e pendências do Linear

> **For agentic workers:** Use superpowers:executing-plans para implementar e verificar cada tarefa. Execução nesta máquina Windows, no checkout limpo, sem delegação.

**Goal:** Trabalhar no Auth com autenticação e bancos reais locais e concluir as lacunas de implementação deste repositório identificadas no Linear.

**Architecture:** Preservar os contratos centrais existentes. PostgreSQL exclusivo em loopback, dois bancos DEV e mensagens capturadas no disco permitem cadastro/recuperação sem serviços externos. A conta apresenta vínculos consultados pelo identificador autenticado e mantém a seleção da empresa no produto.

**Tech Stack:** Next.js 16, React 19, Prisma 6, PostgreSQL, Node.js 22+.

**Spec:** Critérios de AVL-384, AVL-386, AVL-388, AVL-421 e AVL-431 consultados no Linear em 13/11/2026; escopo autorizado pelo usuário: implementações em auth.avilaops.com em DEV local, sem servidor.

## Restrições

- Não modificar ERP, CRM, Mail ou gateway MCP neste lote.
- Não substituir autenticação por sessão simulada nem conceder vínculo por e-mail/CNPJ.
- Não alterar política de MFA, contas ou serviços publicados.
- Dados e segredos DEV fora do Git; captura de mensagens somente em development com base em loopback.
- Preservar dados locais ao repetir preparação; não redefinir senha ou revogar sessões existentes.
- Entregar em PR draft: PR pronto dispara merge/deploy automáticos.
- Critérios de ambiente publicado e integrações externas permanecem explicitamente pendentes no Linear.

## Revisão

- Preparação não pode apontar para bancos externos ou compartilhar o banco DEV com testes destrutivos.
- Produção não pode usar o transporte de e-mail DEV.
- Conta de outra pessoa, vínculo suspenso/revogado e autorização em unidade suspensa não podem aparecer como acesso ativo.
- Falha de consulta deve ser erro, nunca lista vazia que sugira inexistência de vínculos.
- Logout exige confirmação de alcance e continua protegido por origem e destinos registrados.

### Task 1: Ambiente DEV reproduzível

**Files:** `scripts/dev-local.mjs`, `scripts/dev-local-config.mjs`, `src/lib/emailLocal.ts`, `src/lib/email.ts`, `package.json`, `.gitignore`, `tests/devLocal.test.ts`, `tests/emailLocal.test.ts`, `docs/DEV-LOCAL.md`.

**Interfaces:** `npm run dev:setup` prepara PostgreSQL/bancos/migrações/contas; `npm run dev:local` inicia no loopback; `npm run dev:emails` lê mensagens locais. Configuração em `.env.development.local` e dados em `.local/auth/`.

- [x] Testar recusa de banco remoto, produção e base de e-mail externa; capturar envio real em diretório temporário.
- [x] Implementar preparação idempotente, migrações reais e dados sintéticos, sem sobrescrever ambiente existente.
- [x] Rodar preparação duas vezes e confirmar preservação das credenciais/dados.

### Task 2: Identidade, acesso e saída da conta

**Files:** `src/lib/acessosDaConta.ts`, `src/app/conta/AcessosDaConta.tsx`, `src/app/conta/page.tsx`, `src/app/conta/ContaShell.tsx`, `src/app/sair/page.tsx`, `tests/acessosDaConta.test.ts`, `tests/acessosDaContaBanco.test.ts`, testes existentes de conta/logout.

**Interfaces:** Consulta limitada a `contaId` autenticado; componente recebe somente projeção de vínculos e permissões do servidor. Nenhuma mutação corporativa nesta tela.

- [x] Testar estados de e-mail, ausência de empresas, vínculo ativo/suspenso/revogado e isolamento por conta com PostgreSQL.
- [x] Mostrar sistema/empresa/unidade/papel sem eleger empresa global ou inferir convites.
- [x] Encaminhar saída pelo `/sair` e explicar limites de notificação/renovação, preservando POST de confirmação.

### Task 3: Validação e entrega

**Files:** documentação de evidências, `.agents/equipe/controle.json`, PR e issues existentes no Linear.

- [x] Executar suíte padrão, suítes PostgreSQL do núcleo/corporativo/MCP, tipos, lint e build.
- [x] Corrigir drift confirmado pelo migrate diff: relações MCP já criadas pela migração e ausentes/divergentes no Prisma; declarar as FKs existentes e ON UPDATE NO ACTION, sem alterar SQL ou dados.
- [x] Validar login real, cadastro/recuperação com mensagem capturada, navegação e logout em desktop/mobile local.
- [ ] Registrar revisão, resultados e limitações; publicar branch e PR draft sem merge/deploy.
- [ ] Atualizar Linear com evidências, sem concluir critérios que exigem outros repositórios/produção.
