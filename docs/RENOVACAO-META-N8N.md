# Renovação das conexões Meta com retomada

O modo contínuo chama `POST /api/interno/meta/renovar?continuar=1` uma vez por
minuto. Cada chamada processa no máximo dez conexões. O Auth guarda o cursor
em `rotinas_estado`, chave `meta.renovacao.worker.v1`; o n8n não precisa manter
cursor nem acumular centenas de páginas numa execução. Não há teto fixo de
mil conexões por varredura. Isso não comprova capacidade ou vazão para 300 mil
conexões: a rodada continua levando tantas passagens quanto o volume exigir
e depende dos limites da Graph API.

## Contrato e recuperação

- Autenticação: cabeçalho `x-avila-webhook-token`, valor de
  `N8N_CAIXA_WEBHOOK_TOKEN`, pela credencial existente do Auth no n8n.
  Cookie SSO não concede acesso.
- O Auth seleciona conexões com vencimento nos próximos quinze dias. Congela
  o limite superior de identificadores e a data de corte ao iniciar a rodada;
  novas conexões entram na rodada seguinte.
- O estado contém cursor, data de corte, limite de identificadores, horário
  da próxima rodada e reserva com dono aleatório. Não contém token ou e-mail.
- Compare-and-swap no banco permite uma passagem por vez entre réplicas.
  Reserva interrompida expira após três minutos; chamada que encontra reserva
  ocupada retorna `ocupada: true` sem repetir o lote.
- A resposta inclui contadores, `continuacaoPendente`, `ocupada`, `proximaEm`
  (epoch em milissegundos) e `requestId`. `proximoCursor` é nulo neste modo;
  o cursor real permanece no banco. Cada disparo seguinte retoma o progresso.
- Ao terminar, a rotina aguarda uma hora antes de começar nova varredura.
  Falhas parciais avançam o cursor para não bloquear as demais contas; as
  conexões com falha são elegíveis na próxima varredura. Falha que interrompe
  o lote mantém o último checkpoint e permite repetir o mesmo lote.
- Timeout da Graph: dez segundos por conexão. A reserva de cada conexão,
  também persistente, evita repetir sucessos no mesmo dia UTC após reexecução.
  Gravação compara token cifrado e validade anteriores para não sobrescrever
  reconexão ou exclusão ocorrida durante a chamada.
- HTTP 200 com `ok: false` significa falha parcial; o workflow acusa erro.
  HTTP 503 significa banco/conector indisponível; 401, credencial inválida.
  Contrato antigo de paginação explícita por `?cursor=` continua funcionando.
  Não combinar `cursor` com `continuar=1`.

Auditoria em `/admin/eventos`: `meta_token_renovado` e `meta_falhou`, autor
`rotina:n8n-meta`. Logs incluem correlação, contadores e duração. Tokens ficam
cifrados no Auth e respostas da Graph não são copiadas para a auditoria.
Dados de execução no n8n ficam com retenção `none`; alertas usam o workflow
central já existente e dependem da política desse workflow.

## Operação e configuração

Workflow no projeto pessoal de Nicolas Avila, na raiz:
<https://n8n.avilaops.com/workflow/LLJt52OdWppJ3TAL>.
Fonte em `docs/n8n/auth-meta-renovar.sdk.txt`. Fuso `America/Sao_Paulo`, três
tentativas HTTP com cinco segundos de espera, timeout HTTP de dois minutos,
timeout do workflow de dez minutos e workflow de erro `dtk7UwKorqvDIqfu`.
Publicar a nova versão do workflow somente após o endpoint atualizado estar
implantado; a versão antiga permanece compatível durante o deploy.

A migração adiciona índice por `expira_em, id` para seleção das conexões.
O checkpoint usa a tabela existente `rotinas_estado`.

`PORTAL_DB_POOL_MAX`, `PORTAL_DB_CONNECTION_TIMEOUT_MS` e
`PORTAL_DB_IDLE_TIMEOUT_MS` configuram o pool separado do banco de contas.
Padrões: três conexões, dez segundos de espera e trinta segundos de
ociosidade. Somar pools de todas as réplicas e o pool do Prisma antes de
alterar os valores. O tamanho não é aumentado automaticamente nesta entrega.

## Verificação e limites

Testes focados cobrem retomada entre processos, mais de cem páginas, falhas
parciais, banco indisponível, reserva expirada, concorrência e configuração
do pool. Tipos, lint, suíte completa e imagem rodam no GitHub Actions.

Aviso ao cliente para reconectar e testes de carga com 300 mil registros
continuam pendentes. A listagem de contas ainda usa o teto de 5.000:
substituí-la requer resolver os filtros que cruzam o banco de contas e o
banco do Auth.
