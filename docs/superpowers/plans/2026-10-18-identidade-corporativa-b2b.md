# Identidade corporativa B2B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar organizações, unidades, vínculos, papéis e alçadas corporativas revogáveis para os produtos Ávila Ops.

**Architecture:** O Auth persiste autorização corporativa e expõe um contrato HTTP versionado. Clientes provisionam somente registros próprios com Basic e consultam contextos atuais com Bearer; JWTs permanecem mínimos.

**Tech Stack:** Next.js 16, TypeScript, Prisma 6, PostgreSQL, Node test runner

**Spec:** `docs/superpowers/specs/2026-10-18-identidade-corporativa-b2b-design.md`

## Global Constraints

- Preservar `portal_clients.organization_id` e `core.memberships` durante a transição.
- Valores monetários são inteiros em centavos e moeda BRL.
- Papéis e situações são conjuntos fechados validados no servidor.
- Um cliente OIDC nunca alcança organização pertencente a outro cliente.
- Nenhum contexto corporativo completo entra no JWT.

## Review Focus

- Conta em duas organizações recebe ambas, sem contexto implícito.
- Autorização de unidade não vaza para unidade irmã.
- Vínculo suspenso ou revogado desaparece imediatamente.
- Repetição do mesmo provisionamento não duplica organização, unidade ou vínculo.
- Referência externa de outro cliente não permite tomada de registro.

---

### Task 1: Modelo persistente e regras puras

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261018190000_identidade_corporativa_b2b/migration.sql`
- Create: `src/lib/corporativo.ts`
- Create: `tests/corporativo.test.ts`

**Interfaces:**
- Produces: `normalizarPapelCorporativo`, `normalizarSituacaoCorporativa`, `autorizacaoAlcancaUnidade`, tipos do contrato `avila.corporativo.v1`.

- [x] Escrever testes vermelhos para papéis, situações, alçada e escopo por unidade.
- [x] Executar `npm test -- tests/corporativo.test.ts` e confirmar falha por módulo ausente.
- [x] Criar schema, migração e regras puras mínimas.
- [x] Executar testes direcionados e confirmar verde.

### Task 2: Provisionamento idempotente e auditado

**Files:**
- Modify: `src/lib/corporativo.ts`
- Modify: `src/lib/eventos.ts`
- Create: `src/app/api/provisionamento/corporativo/route.ts`
- Create: `tests/corporativoBanco.test.ts`

**Interfaces:**
- Consumes: modelos e validadores da Task 1.
- Produces: `provisionarContextoCorporativo`, `alterarSituacaoDoVinculo` e rota Basic do cliente proprietário.

- [x] Escrever testes vermelhos de idempotência, isolamento, conta inexistente e auditoria.
- [x] Aplicar migrações em PostgreSQL descartável e confirmar as falhas esperadas.
- [x] Implementar transações serializáveis e rota de provisionamento.
- [x] Confirmar testes de banco verdes.

### Task 3: Consulta revogável de contextos

**Files:**
- Modify: `src/lib/corporativo.ts`
- Create: `src/app/api/corporativo/contextos/route.ts`
- Modify: `src/lib/oidc.ts`
- Modify: `tests/corporativoBanco.test.ts`
- Modify: `tests/ssf.test.ts`

**Interfaces:**
- Consumes: Bearer validado por `verificarAccessToken` e audiência do cliente.
- Produces: `listarContextosCorporativos(contaId, clienteId)` e resposta `avila.corporativo.v1` sem cache.

- [x] Escrever testes vermelhos para múltiplos contextos, escopos e revogação imediata.
- [x] Implementar consulta e rota, sem copiar matriz para o JWT.
- [x] Atualizar descoberta OIDC somente com a claim de versão suportada.
- [x] Confirmar testes direcionados verdes.

### Task 4: Contrato de integração e verificação

**Files:**
- Create: `docs/CONTRATO-CORPORATIVO-V1.md`
- Modify: `docs/PAPEIS-VINCULOS-E-ACESSO.md`
- Modify: `.agents/equipe/controle.json`

**Interfaces:**
- Produces: payloads e sequência de integração para AVL-232 e AVL-247.

- [x] Documentar provisionamento, escolha explícita e revalidação.
- [x] Executar migração em banco descartável, suíte completa, TypeScript, ESLint e build.
- [x] Registrar evidências e bloqueios no controle e no Linear.
- [ ] Fazer um único commit e abrir PR após toda a verificação.
