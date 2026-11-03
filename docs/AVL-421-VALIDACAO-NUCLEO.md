# AVL-421 — integridade do núcleo e validação de migrações

## Escopo desta rodada

Continuação do [contrato central v1](CONTRATO-AUTH-CENTRAL-V1.md), já integrado
no PR #44. Base inspecionada: `2a4989d`. A descrição inicial da issue ainda
mencionava migração pendente; comentários posteriores registram validação local.
Esta rodada acrescenta uma garantia de persistência e sua reprodução automatizada.
Na retomada, o mesmo PR também alinha os tipos nativos UUID corporativos às
migrações existentes e passa a exigir ausência de diferenças no `migrate diff`.

Registro: [AVL-421](https://linear.app/avilaops/issue/AVL-421), subordinada à
[AVL-420](https://linear.app/avilaops/issue/AVL-420). As ferramentas de notas
`get_agent_context` e `record_agent_learning` retornaram `Tool not found`;
as evidências ficaram na issue e neste documento.

O cliente da aplicação A não pode apontar para um ambiente da aplicação B.
As FKs independentes anteriores verificavam apenas a existência dos dois registros.
A relação agora usa `(ambiente_id, app_id)` → `(id, aplicacao_id)`.

## Fronteiras e estado verificado

Os nomes abaixo representam responsabilidades do contrato v1; não exigem uma
tabela nova para cada política. Dados comerciais permanecem nos consumidores.

| Fronteira | Implementação encontrada | Classificação nesta rodada |
| --- | --- | --- |
| Aplicacao | `Aplicacao` / `aplicacoes`; catálogo em `cadastro.ts` | Existente; não alterada |
| AmbienteAplicacao | `AmbienteAplicacao` / `ambientes_aplicacao` | Existente; integridade com o cliente reforçada |
| ClienteOidc | `ClienteOidc` / `clientes_oidc` | Existente; relação composta implementada e testada |
| RedirectUri | `RedirectUri` / `redirect_uris`; leitura em `redirectsOidc.ts` | Existente; backfill, deduplicação e cliente sem redirect testados no banco |
| PoliticaAcesso | `PoliticaAplicacao` e tipo `PoliticaAcesso` em `politicaAplicacao.ts` | Existente; backfill de restrição e MFA testado no banco |
| Permissao | `Permissao` por e-mail/aplicação; autorização corporativa em entidades próprias | Existente; não converte regra comercial em permissão central |
| Sessao | Tipo `Sessao` e cookie assinado em `sessao.ts`; `CodigoOAuth` e `RefreshOAuth` persistidos | Parcial frente ao objetivo amplo de revogação; não existe modelo Prisma chamado `Sessao` |
| PoliticaProvisionamento | Campos de `PoliticaAplicacao` e `/api/provisionamento/acessos` | Existente como política e comportamento; sem entidade Prisma separada |
| PoliticaLogout | Destinos normalizados `post_logout`, `logoutUri` e `avisoDeLogout.ts` | Parcial frente ao objetivo amplo: aviso assinado best-effort por `sub`; entrega durável/idempotência no consumidor não comprovadas nesta rodada |
| EventoAuditoria | `Evento` / `eventos` e `eventos.ts` | Existente; sem nova tabela redundante |

Não foram duplicados os trabalhos de consumidores AVL-422/423/424. A reserva
da AVL-420 em `cadastro.ts`, teste de cadastro e documentação central foi
preservada usando worktree e documento separados.

## Invariantes de persistência

1. `ambienteId = null` permanece aceito durante a transição, como no contrato
   já existente. O cadastro atual ainda pode criar clientes sem ambiente.
2. Um ambiente informado deve existir e pertencer à aplicação do cliente.
3. Atualizar `appId` ou `ambienteId` não pode cruzar aplicações.
4. Mover um ambiente referenciado não altera a aplicação dos clientes por cascata.
5. A migração não troca client IDs, hashes, destinos, políticas ou dados de contas.
6. Dados divergentes fazem a migração falhar. Não há reparo automático nem
   atribuição presumida de ambiente, empresa ou tenant.

Essa associação não implementa, por si só, política de habilitação do ambiente
no protocolo OIDC. Também não torna `ambienteId` obrigatório nem adiciona uma
tela de gestão de ambientes.

## Migração e operação autorizada

Nova migração: `20261103060000_cliente_oidc_ambiente_aplicacao`.

- Cria índice único composto na tabela de ambientes.
- Adiciona e valida a FK composta antes de remover a FK simples redundante.
- Usa transação explícita: falha na validação desfaz também a criação do índice.
- `ON UPDATE RESTRICT` e `ON DELETE RESTRICT` impedem reatribuição implícita.
- Adiciona validação sobre os dados; não altera migrações já integradas.

Antes de qualquer implantação autorizada, executar com a conexão fornecida
pelo ambiente, sem copiar seu valor para logs ou registros:

```sh
npm run db:preflight-aplicacoes
npx prisma migrate deploy
```

O preflight é somente leitura. Continua aceitando o esquema anterior ao núcleo,
verifica aplicações órfãs e, quando a tabela de ambientes está presente, conta
clientes com ambiente inexistente ou de outra aplicação. Respeita tanto
`?schema=...` da URL Prisma quanto `options`/`search_path` da conexão e imprime
apenas contagens. Schema explícito ausente falha, sem consultar `public`.
A checagem não substitui a FK: a restrição
continua sendo validada no banco, inclusive se houver escrita após o preflight.

Se houver divergência, o menor desbloqueio é o responsável pelos dados confirmar
a aplicação/ambiente corretos e corrigir o cadastro em procedimento autorizado.
Não reaplicar nem marcar como resolvida uma migração Prisma falha sem conferir
o estado real e o procedimento de recuperação do ambiente.

O índice e a validação da FK podem bloquear escritas durante a migração.
Esta rodada não mede volume nem tempo de bloqueio em produção.

## Reprodução dos testes

Usar um PostgreSQL descartável exclusivo, com permissão para criar schemas.
`TEST_AUTH_DATABASE_URL` nunca recebe fallback de `DATABASE_URL`. O teste cria
schema aleatório, aplica o SQL real das migrações e remove somente esse schema
ao terminar. Não usa dados reais nem faz chamadas a consumidores.

```sh
npm ci
npx prisma generate
node --experimental-strip-types --disable-warning=ExperimentalWarning \
  --import ./tests/register.mjs --test tests/nucleoAuthBanco.test.ts
npm test
npm run typecheck
npm run lint
```

Definir `TEST_AUTH_DATABASE_URL` no ambiente dos comandos de teste. Sem ela,
a suíte de banco é explicitamente pulada. O workflow `Contrato central Auth`
fornece PostgreSQL 16 descartável, executa `prisma validate`, `migrate deploy`,
preflight e a suíte dedicada. É chamado pelo workflow principal e obrigatório
antes do build de imagem, portanto uma falha impede o merge automático atual.
O workflow de contrato não contém implantação.

Cobertura adicionada:

- backfill a partir de clientes anteriores ao núcleo, preservando hashes e texto;
- destinos CRLF/LF repetidos e integração somente de API;
- projeção de restrição e MFA para a política persistida;
- rejeição de INSERT/UPDATE com ambiente de outra aplicação;
- rejeição de movimentação de ambiente referenciado;
- compatibilidade de cliente sem ambiente e vínculo válido posterior;
- preflight antes e depois do núcleo, respeitando schema isolado;
- migração e preflight recusando divergência legada sem modificar seus dados.
- operações reais pelo Prisma com relações corporativas UUID, autorização com
  unidade opcional e identificadores externos textuais.

## Limites da evidência

Em 03/11/2026, ambiente local Node 24.21.0 / PostgreSQL 18 / UTF-8:

- `prisma validate` e `prisma generate`: aprovados com Prisma 6.19.3.
- `prisma migrate deploy`: 28 migrações aplicadas em banco novo descartável.
- `db:preflight-aplicacoes`: aprovado no banco novo e nos testes de legado.
- Suíte dedicada: 7 testes aprovados; regressões foram reproduzidas antes das
  correções da FK e do schema da conexão, inclusive com `?schema=public` na URL
  de teste e schema aleatório da fixture.
- `npm test` com `TEST_AUTH_DATABASE_URL`: 347 testes aprovados. Outros testes
  condicionais de banco não foram habilitados por suas variáveis específicas.
- `npm run typecheck`: aprovado; `npm run lint`: zero erros e um warning
  preexistente de `<img>` em `Marca.tsx`.
- YAML dos dois workflows analisado com PyYAML; `git diff --check` aprovado.
- Revisão independente somente leitura: corrigidos o vínculo do CI ao fluxo
  de merge, o tratamento da URL Prisma e a remoção de schema herdado na fixture;
  revisão final sem achados pendentes.
- A primeira execução do contrato no CI detectou diferença de SQLSTATE na
  restrição de movimentação de ambiente: PostgreSQL 16 retorna `23503`,
  PostgreSQL 18 retorna `23001`. A escrita era recusada nos dois. O teste aceita
  os dois códigos observados, exige a constraint composta correta e verifica
  os dados preservados. A falha bloqueou imagem/deploy conforme projetado.

`prisma migrate diff --from-url … --to-schema-datamodel prisma/schema.prisma
--exit-code` retornou 2: divergência preexistente entre UUID nas migrations e
`String` sem `@db.Uuid` no Prisma das tabelas `organizacoes_corporativas`,
`unidades_corporativas`, `vinculos_corporativos` e `autorizacoes_corporativas`.
Os arquivos da base `2a4989d` contêm a mesma divergência. Na primeira entrega,
estas entidades foram preservadas e o achado ficou documentado.

## Retomada — mapeamento UUID corporativo

O incremento corrige oito campos com `@db.Uuid`: as quatro chaves primárias,
`organizacaoId` de unidade e vínculo, `vinculoId` e `unidadeId` de autorização.
`clienteId`, `contaId` e referências externas continuam textuais. O schema passa
a declarar os tipos que as migrações já criam; não foi criada nova migração,
executada conversão de dados nem alterado default ou política de provisionamento.

Na mesma base descartável, o comando abaixo retornou 2 antes do ajuste e 0
com `No difference detected` depois dele, sem alterar o banco entre as leituras:

```sh
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --exit-code
```

`DATABASE_URL` deve apontar para a base exclusiva de validação. O workflow de
contrato executa esse comando após as 28 migrações e gera explicitamente o
Prisma Client antes do teste de operações corporativas. Também executa a suíte
existente `corporativoBanco.test.ts`, habilitada no mesmo serviço descartável,
em comando separado após a suíte do núcleo. Uma nova divergência
faz o job falhar. O diff verifica o modelo suportado pelo Prisma; não substitui
os testes das constraints SQL nem comprova o estado de produção.

O novo teste cria organização, unidade, vínculo e autorizações, consulta relações
por UUID, atualiza papel, consulta por FK, aceita `unidadeId = null` e remove os
dados via Prisma. O mesmo fluxo também passou antes da correção: é uma prova
de compatibilidade, não uma falha funcional atribuída ao mapeamento anterior.
Os dados são sintéticos e permanecem no schema aleatório descartado pelo teste.
Nenhuma regra comercial, titularidade ou tenant é inferida de `clienteId`.

Verificações locais após o ajuste (Node 24 / PostgreSQL 18 / Prisma 6.19.3):

- `prisma validate` e `prisma generate`: aprovados.
- `prisma migrate deploy`: as mesmas 28 migrações em base nova, sem migração extra.
- Preflight: aprovado; `prisma migrate diff ... --exit-code`: zero diferenças.
- `npm test` com `TEST_AUTH_DATABASE_URL` no formato Prisma: 348/348 aprovados,
  incluindo oito testes do núcleo. Os demais bancos condicionais não são
  habilitados por essa variável.
- `corporativoBanco.test.ts` com `TEST_DATABASE_URL` local: 9/9 aprovados,
  incluindo concorrência, isolamento por cliente/unidade, alçada e revogação.
- Typecheck: aprovado; lint: zero erros e um aviso preexistente em `Marca.tsx`.
- YAML e `git diff --check`: aprovados; revisão independente somente leitura
  sem achados de código pendentes.

Validação local e CI são evidências distintas. Não houve execução em homologação
ou produção, login real de consumidor, migração de consumidor ou comprovação
de entrega externa de logout nesta rodada. A issue-mãe AVL-420 continua
responsável pela conclusão do núcleo amplo e pela migração dos consumidores.

O repositório possui merge e deploy automáticos para PR pronto. A entrega desta
rodada deve permanecer em PR draft até revisão e autorização de integração.
