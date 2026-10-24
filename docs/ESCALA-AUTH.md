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

Filtros por MFA/último acesso, ordenação por empresa/último acesso e
agrupamentos continuam usando o caminho antigo de até 5.000 contas. Quando o
limite é ultrapassado, a tela informa que resultados e totais são parciais.
Não se pagina uma amostra para depois aplicar esses filtros, pois isso
produziria páginas e contagens incorretas.

Para remover esse caminho será necessário definir uma projeção consultável
que concilie dados dos dois bancos, com atualização, reconciliação e indicação
de frescor. Dados de projeção não poderão autorizar acesso: permissões
continuam sendo conferidas nas fontes de verdade.

O seletor de empresas ainda carrega o cadastro inteiro. Falta transformá-lo
em uma busca remota paginada antes de certificar 300 mil empresas.

`OFFSET` profundo, contagens e busca textual sem índice podem custar caro.
Não se criam índices no banco compartilhado do portal por uma migração Prisma
do banco do Auth. É preciso medir `EXPLAIN (ANALYZE, BUFFERS)` em uma réplica
representativa, ajustar índices pelo projeto dono e avaliar cursores.

## Verificação

`tests/contasConsultaSql.test.ts` verifica seleção de caminho, parâmetros,
limites, proteção contra SQL arbitrário e reconhecimento de CPF.
`tests/contasPaginadasBanco.test.ts` usa `TEST_PORTAL_DATABASE_URL` e uma tabela
temporária com 300.000 contas fictícias. O job dedicado de GitHub Actions roda
PostgreSQL isolado e bloqueia a imagem caso os testes falhem.

Esse teste verifica paginação e contagens sobre 300 mil registros, **não**
certifica 300 mil usuários simultâneos nem o desempenho do servidor real.
Ainda faltam carga concorrente de login/refresh, latência p95/p99, CPU do
bcrypt, orçamento de conexões por réplica, comportamento sob falha e
verificação de isolamento entre empresas no fluxo completo dos consumidores.
Nenhum teste de carga é disparado contra produção por esta suíte.
