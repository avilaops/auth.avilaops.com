# Roadmap — auth.avilaops.com

Atualizado em 12/10/2026. O que está em produção fica no README; aqui só o que
falta, em ordem de prioridade.

## Agora

- **Sistemas consumindo a conexão da Meta.** O CRM é o primeiro: lê
  `GET /api/meta/ativos` por `POST /api/meta/sincronizar`
  (avilaops/crm.avilaops.com#1), mostra a conta e descobre os números. Falta
  cadastrar a integração do CRM em `/admin/integracoes` com a permissão de ler
  a Meta quando ele for para o servidor, e exercitar a rota com uma conexão
  real. Receber mensagem por essa conexão continua em aberto: o webhook da Meta
  pede um segredo por app, e hoje o recebimento é da Messageria.
- **Análise do app na Meta.** A redirect URI `/api/meta/callback` e o callback
  de desautorização foram cadastrados no painel da Meta em 13/10/2026 (Login do
  Facebook para Empresas → Configurações). A exclusão de dados segue como URL
  de instruções (`avilaops.com/exclusao-de-dados`), não como o callback
  `/api/meta/exclusao`. Falta conectar uma conta real em `/conta/meta` e gravar
  o screencast. Pedir só as permissões que a tela mostra (tabela no README).
- **Cadastro incorporado do WhatsApp.** O app na Meta tem a configuração
  `1279500135254209` (cadastro incorporado, token de usuário do sistema), mas o
  Auth só faz o redirecionamento comum: não abre a janela do SDK nem recebe a
  conta e o número que ela devolve. Sem isso, cliente não liga o WhatsApp pelo
  Auth com essa configuração.
- **Migrar Notas e TMS para o cadastro do painel.** Hoje são integrações fixas
  em `src/lib/oidc.ts`, com segredo em variável de ambiente. Migrar é criar a
  integração no painel com o mesmo identificador, trocar o segredo no sistema e
  remover a entrada do código.

## Depois

- **Renovação da conexão da Meta sem depender de uso.** Hoje o token é
  renovado quando um sistema lê a conexão a menos de 15 dias do vencimento.
  Conta que ninguém lê por 60 dias vence. Falta uma rotina diária (n8n) e o
  aviso ao cliente quando a conexão estiver para vencer.
- **Rotação de chave no OIDC.** O `id_token` sai em RS256 com `jwks_uri` e o
  refresh token existe. Falta trocar a chave de assinatura pelo painel.
- **Sistemas ouvindo o aviso de saída.** O Auth já avisa a integração que
  cadastrar um endereço; nenhum sistema cadastrou ainda. Sem isso, quem entrou
  por OIDC só percebe a saída quando o access token vence ou ao tentar renovar.
- **TMS conferir o `id_token`.** Ele descarta o `id_token` e busca a identidade
  no `/oauth/userinfo`, porque antes não havia como conferir a assinatura.

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
