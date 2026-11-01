# Estados de e-mail da conta

## Persistência

As contas locais são lidas de `portal_clients`, pela conexão
`PORTAL_DATABASE_URL`. O Prisma usa `DATABASE_URL` para outro conjunto de
tabelas. Não foi criado um segundo modelo de conta no Prisma.

O DDL versionado está em
`migrations/portal/202610290001_email_verification.sql`:

| Coluna | Tipo | Padrão | Campo de domínio |
| --- | --- | --- | --- |
| `email_verificado` | `boolean not null` | `false` | `emailVerificado` |
| `mfa_email_ativo` | `boolean not null` | `false` | `mfaEmailAtivo` |
| `mfa_email_bloqueado_ate` | `timestamptz` | `null` | `mfaEmailBloqueadoAte` |

A migração é aditiva e pode ser reaplicada sem redefinir os valores existentes.
Ela não reconstrói confirmações históricas: contas existentes começam com
`email_verificado = false`. Não há índice novo, pois esta etapa não consulta
nem ordena contas por esses estados.

Todas as consultas que devolvem `Conta`, incluindo a paginação, projetam os
campos. O domínio não inclui o hash da senha. A alteração de endereço por
`atualizarConta` limpa os três estados no mesmo UPDATE. Alterar apenas caixa
ou espaços do endereço normalizado preserva os estados. Escritores externos
da tabela compartilhada também precisarão respeitar a invalidação ao trocar
o endereço; esta etapa não adiciona um gatilho ao banco compartilhado.

## Limites da entrega

- Persistir `mfa_email_ativo` não implementa nem habilita MFA por e-mail.
- Persistir um prazo de bloqueio não implementa controle de concorrência ou
  limite de reenvio. A futura emissão precisa de reserva atômica, não apenas
  de uma leitura seguida de envio.
- O cadastro por link, as identidades externas e os claims OIDC ainda precisam
  ser ligados ao novo estado. O `email_verified` fixo do OIDC não foi alterado.
- O envio de confirmação e os seletores de e-mail/SMS permanecem bloqueados.
- A tela de segurança mostra o estado persistido; ausência de conta local
  continua exibindo "Confirmação não informada".

## Ordem de publicação

Esta etapa foi preparada para validação local. O DDL **deve ser aplicado antes
da imagem** que lê as colunas, no banco de contas. `prisma migrate deploy`
não aplica esse arquivo. O pipeline atual não executa migrações do portal;
essa etapa precisa ser incorporada ao processo aprovado de implantação antes
de integrar/publicar esta branch. Nenhuma migração de produção foi executada.

Um rollback do aplicativo pode manter as colunas aditivas. Não remover colunas
como parte do rollback, para preservar estados já gravados.

## Testes reproduzíveis

`tests/contasEmailBanco.test.ts` usa uma tabela temporária com conexão única e
aplica o DDL real. Cobre registros anteriores à migração, defaults de novas
contas, login, consultas individuais/listagens/paginação, datas com fuso,
reaplicação, invalidação ao trocar endereço e rejeição de booleanos nulos.

Os testes de paginação continuam cobrindo 300 mil contas e 300 mil empresas
sintéticas. A suíte de estados foi adicionada ao job PostgreSQL do CI.
Ela exige `TEST_PORTAL_DATABASE_URL`; sem a variável, é explicitamente pulada.

As capturas do navegador com registros sintéticos marcados no banco comprovam
somente a leitura do estado pela interface. Não comprovam envio, recebimento
ou consumo de um link de confirmação.
