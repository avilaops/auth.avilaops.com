# Renovação diária das conexões Meta

O n8n agenda `POST /api/interno/meta/renovar` às 08h de São Paulo. O Auth
seleciona até dez conexões por chamada com vencimento nos próximos quinze dias.
Não retorna e-mails, ativos nem tokens: somente contadores, `requestId` e
`proximoCursor`. Conexões sem validade informada não entram na rotina.

## Autenticação e paginação

O cabeçalho `x-avila-webhook-token` usa `N8N_CAIXA_WEBHOOK_TOKEN`, o segredo
compartilhado que já autentica os workflows do Auth. No n8n, reutilizar a
credencial `Auth Webhook Auth (criar caixa)`. Cookie SSO não concede acesso.

Repetir com `?cursor=<proximoCursor>` até `proximoCursor` ser nulo. A ordem
é por identificador; conexões já renovadas podem sair da seleção sem deslocar
a página seguinte. Se atingir o limite de páginas do workflow, a execução
falha visivelmente e pode ser retomada com o último cursor.

## Falhas e reexecução

- Graph: timeout de dez segundos por conexão. Uma falha não interrompe o lote.
- HTTP 200 com `ok: false` indica falhas parciais; o n8n encerra com erro depois
  de processar as páginas, acionando o workflow central de erros.
- Banco ou conector indisponível: HTTP 503. Credencial inválida: 401.
- Reservas em `rotinas_estado` impedem duplicidade entre instâncias. Uma
  reserva interrompida expira em três minutos; conclusão marca o dia UTC.
- Falhas liberam a reserva; repetir manualmente recupera as conexões com erro.
  As concluídas naquele dia são ignoradas. Há no máximo uma linha de estado
  por conexão processada; linhas órfãs não contêm dados pessoais ou tokens.
- A gravação compara o token cifrado e o vencimento anteriores. Desconectar
  ou autorizar novamente enquanto a chamada está em curso impede a sobrescrita.
- Validade ausente ou menor que a anterior não é aceita na renovação.

Auditoria em `/admin/eventos`: `meta_token_renovado` e `meta_falhou`, autor
`rotina:n8n-meta`. Logs incluem correlação e duração, sem resposta da Graph.
Tokens permanecem cifrados pelo Auth. Dados de execução do workflow não são
salvos; o resumo agregado continua disponível na execução em andamento.

## Validação e ativação

Executar testes, tipos, lint e imagem no GitHub Actions. O teste unitário
`tests/renovacaoMeta.test.ts` não chama Meta nem banco. Testar no n8n com
respostas HTTP fixadas, incluindo sucesso, falha parcial e limite de páginas.

O workflow deve permanecer desativado até o endpoint estar implantado e uma
chamada autenticada confirmar o contrato. Nenhuma migração nova é necessária:
`rotinas_estado` já é usada pelas rotinas SSF. A renovação por leitura dos
ativos continua disponível. Avisos ao cliente sobre reconexão e análise do
app Meta continuam pendentes; esta entrega registra conexões vencidas no painel.

Workflow criado no projeto pessoal de Nicolas Avila, na raiz:
<https://n8n.avilaops.com/workflow/LLJt52OdWppJ3TAL>.
Fonte SDK em `docs/n8n/auth-meta-renovar.sdk.txt`. Configurações aplicadas após
importar: fuso `America/Sao_Paulo`, workflow de erro `dtk7UwKorqvDIqfu`,
sem salvar dados de execução, timeout de uma hora e credencial de cabeçalho
do Auth. São até cem páginas por execução, com três tentativas HTTP e cinco
segundos entre tentativas; a conclusão acusa limite atingido em vez de omitir
o restante das conexões.

Verificado em 18/10/2026: nove testes unitários locais aprovados. Testes n8n
com HTTP simulado: execução `98842` aprovada (duas páginas); `98843`, `98844`
e `98845` encerraram com os erros esperados de falha parcial, paginação
incompleta e contrato inválido. Essas simulações não comprovam renovação real
nem validam a paginação HTTP contra o endpoint implantado.

Publicação no repositório público autorizada por Nicolas em 18/10/2026.
O workflow permanece desativado até implantação e validação real do endpoint.
Tipos, lint, suíte completa e imagem são verificados no GitHub Actions do PR.
