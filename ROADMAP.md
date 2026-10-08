# Roadmap — auth.avilaops.com

Atualizado em 08/10/2026. O que está em produção fica no README; aqui só o que
falta, em ordem de prioridade.

## Agora

- **Sistemas consumindo a conexão da Meta.** A API existe
  (`GET /api/meta/ativos`), mas nenhum sistema a chama ainda. Próximo passo é
  no CRM/Messageria: cadastrar a integração em `/admin/integracoes` com a
  permissão de ler a Meta e usar o token para enviar e receber mensagens.
- **Análise do app na Meta.** Cadastrar no painel da Meta a redirect URI e os
  callbacks, conectar uma conta real em `/conta/meta` e gravar o screencast.
  Pedir só as permissões que a tela mostra (tabela no README).
- **Migrar Notas e TMS para o cadastro do painel.** Hoje são integrações fixas
  em `src/lib/oidc.ts`, com segredo em variável de ambiente. Migrar é criar a
  integração no painel com o mesmo identificador, trocar o segredo no sistema e
  remover a entrada do código.

## Depois

- **Renovação da conexão da Meta sem depender de uso.** Hoje o token é
  renovado quando um sistema lê a conexão a menos de 15 dias do vencimento.
  Conta que ninguém lê por 60 dias vence. Falta uma rotina diária (n8n) e o
  aviso ao cliente quando a conexão estiver para vencer.
- **Refresh token e assinatura por chave pública no OIDC.** O `id_token` é
  HS256 com o segredo da sessão, o que só serve para sistema da casa. Software
  de terceiro que valide por `jwks_uri` precisa de RS256.
- **Filtros na lista de contas** por senha provisória e por 2FA.
- **Situação das aplicações conferida automaticamente**, em vez de digitada.
- **`/conta` em seções**, com navegação, em vez de uma página só.
- **Limpeza periódica de `tentativas`.** A função `limparVencidas` existe, mas
  nada a chama; as linhas vencidas são reaproveitadas, não removidas.

## Decisões em aberto (do Nicolas)

- A verificação em duas etapas da equipe está como `opcional` em produção desde
  19/09/2026. Voltar para `obrigatorio` é apagar a linha `MFA_EQUIPE` do `.env`.
- Escopo das permissões de escrita na Meta (mensagens, publicação, leads): só
  pedir quando o sistema que usa tiver a tela pronta.

## Limites conhecidos

- A migração do banco roda no deploy (`MIGRATE_ENV_FILE` na `.conf` do
  `avila-deploy-local`), mas só pelo caminho manual descrito em
  `infra/BUILD-MANUAL.md`.
- O contador de tentativas cai para a memória do processo se o banco não
  responder. É de propósito: limite frouxo é melhor que login fora do ar.
