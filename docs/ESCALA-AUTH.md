# Escala do Auth

## Listagem de contas — 24/10/2026

A consulta comum do painel usa `COUNT`, filtros, ordenação e `LIMIT/OFFSET`
no banco `cliente_portal`, em uma transação read-only/repeatable-read.
A página traz no máximo 100 contas e não seleciona hashes de senha. MFA e
último login são consultados no banco do Auth somente para os e-mails da
página. A autorização administrativa ocorre antes dessas leituras.

Não há duplicação de identidade nem cópia de permissões para otimizar a tela.
Os totais são agregados no banco; não são o tamanho de uma amostra de 5 mil.
O timeout SQL de 10 segundos por comando limita consultas administrativas.

### Semântica

- Busca por nome/e-mail: todos os termos, sem acento/maiúscula; `%` e `_` são
  literais. CPF/telefone são comparados só pelos dígitos. A busca sigilosa
  existente continua guardando documentos no servidor, fora da URL.
- Filtros por empresa, tipo, papel, estado e senha são aplicados antes do
  corte, com E entre filtros e OU entre opções.
- Ordenação SQL por nome normalizado, perfil, estado ou criação; valores
  ausentes ficam por último, com desempate estável por ID.
- A ordem textual SQL usa a collation `C` sobre o nome normalizado. É
  determinística, mas não reproduz a ordenação numérica natural do
  `Intl.Collator` antigo (por exemplo, "Conta 10" precede "Conta 2").
- Agrupamentos mostram somente os itens/quantidades da página, com paginação.

### Limitações ainda abertas

Filtros por MFA/último acesso e ordenação por empresa/último acesso
continuam usando o caminho antigo de até 5.000 contas. Quando o
limite é ultrapassado, a tela informa que resultados e totais são parciais.
Não se pagina uma amostra para depois aplicar esses filtros, pois isso
produziria páginas e contagens incorretas.

Para remover esse caminho será necessário definir uma projeção consultável
que concilie dados dos dois bancos, com atualização, reconciliação e indicação
de frescor. Dados de projeção não poderão autorizar acesso: permissões
continuam sendo conferidas nas fontes de verdade.

Agrupamentos por empresa, perfil e estado usam a página SQL completa quando
os filtros/ordem forem nativos; não disparam mais a consulta antiga só por
estarem agrupados. As quantidades dos grupos continuam restritas à página.

### Seletor de empresas das contas

`GET /api/admin/empresas?q=...&pag=...` devolve 25 opções e `temMais`, sem
contagem global. A consulta SQL limita a 26 linhas para detectar a próxima
página. A rota exige sessão, acesso ao painel, elevação MFA quando exigida
pela política existente e limite de 60 consultas/minuto por conta. Todas as
respostas usam `Cache-Control: private, no-store`.

O filtro só pesquisa quando aberto, espera 300 ms após digitar, cancela
requisições anteriores e não acumula páginas no navegador. Até 50 seleções
ficam preservadas e visíveis entre páginas e buscas. Busca tem até 120
caracteres; página aceita inteiros entre 1 e 100.000. Falhas e ausência de
permissão não são apresentadas como cadastro vazio.

Na abertura de `/admin`, o servidor resolve apenas as empresas selecionadas
na URL. Depois lê os nomes das empresas das contas retornadas (até 100 na
consulta comum; até 5.000 no caminho legado), em vez de carregar todo o
cadastro. IDs são parâmetros, nunca trechos de SQL. Nenhuma autorização é
concedida ao selecionar uma empresa no filtro.

As novas leituras de empresas têm transação read-only e `statement_timeout`
de 10 segundos no PostgreSQL. A política MFA não é alterada nesta entrega.
Outras telas que ainda usam `listarEmpresas()` permanecem a refatorar.

`OFFSET` profundo, contagens e busca textual sem índice podem custar caro.
Não se criam índices no banco compartilhado do portal por uma migração Prisma
do banco do Auth. É preciso medir `EXPLAIN (ANALYZE, BUFFERS)` em uma réplica
representativa, ajustar índices pelo projeto dono e avaliar cursores.

## Verificação

`tests/contasConsultaSql.test.ts` verifica seleção de caminho, parâmetros,
limites, proteção contra SQL arbitrário e reconhecimento de CPF.
`tests/contasPaginadasBanco.test.ts` usa `TEST_PORTAL_DATABASE_URL` e uma tabela
temporária com 300.000 contas fictícias. `tests/empresasPaginadasBanco.test.ts`
cria e remove somente sua fixture de 300.000 empresas no banco descartável
`auth_pagination_test`. O job dedicado de GitHub Actions roda PostgreSQL isolado
e bloqueia a imagem caso os testes falhem. Os testes puros também verificam
parâmetros, contrato da resposta e controles da rota antes da leitura.

Esse teste verifica paginação e contagens sobre 300 mil registros, **não**
certifica 300 mil usuários simultâneos nem o desempenho do servidor real.
Ainda faltam carga concorrente de login/refresh, latência p95/p99, CPU do
bcrypt, orçamento de conexões por réplica, comportamento sob falha e
verificação de isolamento entre empresas no fluxo completo dos consumidores.
Nenhum teste de carga é disparado contra produção por esta suíte.
