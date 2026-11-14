# Conta • plano de implementação

> **For agentic workers:** Executar com superpowers:executing-plans e verificação por tarefa. Sem delegação, conforme a skill de equipe do repositório.

**Goal:** Tornar funcionais e acessíveis as áreas de perfil, segurança, empresas e conexões da conta.

**Architecture:** Reutilizar conta/sessão, permissões corporativas e OAuth centrais. Confirmação de e-mail é transacional no banco do portal; a interface não cria autorização. Seções compartilham ContaShell e são carregadas conforme a área solicitada.

**Tech Stack:** Next.js 16, React 19, Prisma 6, PostgreSQL, Node.js.

**Spec:** `docs/superpowers/specs/2026-11-14-conta-funcional.md`.

## Restrições e revisão

- Preservar alterações locais prévias em layout.tsx, conta/page.tsx e next-env.d.ts.
- Nenhuma alteração de dados/políticas/publicação de produção.
- • nos textos novos; preservar operadores e sintaxe técnica.
- Nenhuma sessão fabricada para demonstrar login.
- Verificar reuso concorrente, troca do e-mail e retorno ao endereço anterior.
- Verificar revogação cruzada, conexões removidas e empresas sem autorização.
- Não transformar falha de consulta em estado vazio.

### Task 1 • Identidade atual e confirmação de e-mail

**Files:** `src/lib/contaAutenticada.ts`, `src/lib/confirmacaoEmail.ts`, `src/lib/emailConfirmacao.ts`, `src/app/api/conta/email/solicitar/route.ts`, `src/app/api/conta/email/confirmar/route.ts`, `src/app/conta/confirmar-email/[token]/page.tsx`, componente de confirmação, migração portal e runner; testes de domínio/rotas/PostgreSQL.

**Interfaces:** `lerContaAutenticada()` distingue sessão ausente/inválida/conta ativa correspondente; `solicitarConfirmacaoEmail(contaId, email, agora?)`; `confirmarEmail(token, agora?)`; `estadoConfirmacaoEmail(token, agora?)`.

- [x] Escrever e executar verificações que falham para conta divergente e confirmação não implementada.
- [x] Implementar reserva/consumo transacionais, limite, invalidação e transporte existente.
- [x] Cobrir concorrência, rollback, expiração, reuso e mudança de endereço no PostgreSQL.

### Task 2 • Empresas e conexões na navegação da conta

**Files:** seções, ContaShell, IconeConta, ResumoDaConta, AcessosDaConta, ConexoesDaConta, lib/conexoesDaConta, lib/acessosDaConta, conta/page.tsx, actions.ts, alias legado /conexoes e testes pertinentes.

**Interfaces:** consulta e revogação por contaId autenticado; paginação de vínculos de 50 por página; resumo usa apenas estados reais.

- [x] Testar seções, paginação, nomes e revogação própria/cruzada.
- [x] Implementar telas, estados e ações, removendo controles sem integração.
- [x] Exercitar navegação, confirmação e revogação em navegador local.

### Task 3 • Verificação e entrega

- [x] Suíte padrão, suites PostgreSQL, tipos, lint, build e smoke test desktop/mobile.
- [x] Atualizar documentação/controle; anexar evidências às issues existentes do Linear, sem concluir critérios externos.
- [x] Preparar entrega em PR draft, preservando mudanças locais não relacionadas e sem deploy. Commit, push e CI são vinculados no PR #58.

Evidência: `docs/CONTA-FUNCIONAL-20261114.md`. 414 testes padrão, 76 PostgreSQL
e 39 grupos de navegador aprovados; tipos, lint e build sem erros. Nenhuma
publicação ou alteração de dados de produção. Rastreio final no PR draft #58.
