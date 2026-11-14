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
ou espaços do endereço normalizado preserva os estados. A migração
`202611140001_email_confirmation.sql` acrescenta uma versão UUID do endereço
e gatilhos: qualquer escritor que troque o e-mail invalida os três estados e
os links anteriores, mesmo quando o endereço original é restaurado. Excluir
a conta remove seu desafio de confirmação.

## Confirmação do endereço atual

A segurança da conta permite enviar um link para o endereço atual de uma
conta autenticada e ativa. `portal_email_confirmacoes` guarda somente o hash
do token aleatório, a identidade/versão do endereço, os prazos e a janela de
envio. A emissão reserva atomicamente um envio por minuto e três por hora.
Reenviar substitui o link anterior; uma falha de transporte mantém a reserva.

O link vale por 30 minutos. GET apenas mostra o pedido; POST consome o token
uma única vez e grava `email_verificado` na mesma transação do banco do portal.
A confirmação pode ocorrer em outro navegador, sem criar sessão ou habilitar
MFA. SMTP/n8n configurados entregam a mensagem; DEV captura no disco. Sem
transporte, a interface informa a indisponibilidade.

## Limites da entrega

- Persistir `mfa_email_ativo` não implementa nem habilita MFA por e-mail.
- A reserva atômica limita apenas a confirmação do endereço; não implementa
  limite de MFA por e-mail.
- O cadastro por link, as identidades externas e os claims OIDC ainda precisam
  ser ligados ao novo estado. O `email_verified` fixo do OIDC não foi alterado.
- SMS e MFA por e-mail continuam fora desta entrega; controles sem ação foram
  retirados da tela. O autenticador existente permanece disponível.
- O portal revalida a conta atual. Bloqueio, endereço divergente ou mudança
  entre equipe e cliente no SSO exigem nova autenticação.

## Ordem de publicação

O entrypoint da imagem aplica o DDL pela conexão `PORTAL_DATABASE_URL` antes
de iniciar `server.js`. `prisma migrate deploy` não aplica esse arquivo.
A conexão deve permitir ALTER em `portal_clients` e criação de tabela, função
e gatilhos. O default UUID pode exigir backfill e locks na tabela compartilhada;
avaliar o volume antes da publicação. O runner usa uma trava de
sessão para serializar inicializações, espera limitada e a transação do DDL.
Uma falha interrompe a inicialização sem imprimir credenciais. A imagem é
construída pelo GitHub Actions; nenhum build é executado no servidor.

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

`tests/portalMigration.test.mjs` executa o CLI real em um schema isolado do
PostgreSQL do CI. Verifica conexão obrigatória, recusa de tabela ausente,
defaults, reaplicação concorrente e preservação de estados existentes.

`tests/confirmacaoEmailBanco.test.ts` cobre emissão/consumo concorrentes,
expiração, reuso, limites, troca e restauração do endereço, escritores externos,
conta desativada/excluída e rollback. `test:browser:conta` emite e consome um
link recebido no disco em outro contexto, sem criar sessão ou alterar MFA.
Isso comprova o fluxo DEV; entrega SMTP/n8n externa exige seu ambiente.

Evidência atual: [Conta funcional • 14/11/2026](CONTA-FUNCIONAL-20261114.md).
