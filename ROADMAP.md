# Roadmap — auth.avilaops.com

Atualizado em 24/10/2026. O que está em produção fica no README; aqui só o que
falta, em ordem de prioridade.

## Agora

- **Escala do Auth: listagem e capacidade.** A consulta comum das contas passa
  a filtrar/paginar no PostgreSQL, com teste isolado de 300 mil registros.
  Faltam remover o caminho limitado dos filtros entre bancos, paginar o
  seletor de empresas, medir índices/concorrência e verificar isolamento no
  fluxo dos consumidores. Limites e critérios em `docs/ESCALA-AUTH.md`.
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
- **Cadastro incorporado do WhatsApp: ligar e testar com conta real.** O
  botão existe (README). Falta preencher `1279500135254209` no campo
  "Configuration ID do cadastro incorporado do WhatsApp" do conector da Meta,
  conferir que o webhook do WhatsApp desse app aponta para a Messageria, e
  ligar um número de verdade.
- **Apple Business como provedor de identidade.** O Auth já é transmissor SSF
  (README). Falta criar a integração do Apple Business em `/admin/integracoes`
  (retorno `https://gsa-ws.apple.com/grandslam/GsService2/acs`, com a marca de
  sinais de segurança) e ligar na Apple; só a tela da Apple confirma a ligação.

## Depois

- **Renovação da conexão da Meta sem depender de uso.** Rotina implementada
  em `POST /api/interno/meta/renovar`. O modo `?continuar=1` persiste o cursor
  entre passagens limitadas, sem o teto de cem páginas do workflow antigo.
  Operação e implantação em `docs/RENOVACAO-META-N8N.md`.
  Aviso ao cliente quando precisar reconectar segue
  pendente; conexões vencidas já geram auditoria no painel.
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
