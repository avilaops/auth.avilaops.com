# AVL-420 — Gravação atômica do catálogo e da política central

## Entrega e fronteiras

Issue: [AVL-420](https://linear.app/avilaops/issue/AVL-420).
Repositório confirmado nos recursos da issue/projeto: `avilaops/auth.avilaops.com`.
Base verificada: `2a4989d58fac03a38db4d8f6cc595add69ba3582`.

`criarCadastro` e `atualizarCadastro` agora usam uma transação Prisma para a
linha de `aplicacoes` e o upsert de `politicas_aplicacao`. O helper de política
recebe o cliente dessa transação; o argumento adicional é opcional para manter
os chamadores da assinatura anterior. Escritas propagam erros de esquema
ausente, em vez de informar sucesso sem persistir a política.

Catálogo e política continuam entidades distintas. Não há nova tabela,
migration, endpoint, infraestrutura ou alteração de permissão. A atualização
usa o ID carregado pelo servidor, preservando outra aplicação mesmo se o ID
nos dados recebidos divergir.

As ações administrativas continuam exigindo admin/MFA antes da função e
registrando os eventos depois que ela retorna. **Auditoria e vínculos em outro
banco não participam desta transação.** O patch não afirma resolver essa
atomicidade distribuída.

## Falha reproduzida

Na base, as funções escreviam no catálogo e depois faziam upsert da política
separadamente. Além disso, `salvarPoliticaAplicacao` ignorava `P2021`/`P2022`.
Consequências verificadas:

- Uma constraint recusava a política, mas a aplicação já tinha sido criada ou
  alterada, inclusive `nome` e autoria de atualização.
- Ausência de tabela/coluna de política não era devolvida como erro. Opções
  sem equivalente no catálogo, como convite obrigatório e proibição de
  recuperação, podiam ser descartadas sem indicação de falha.

Os novos testes foram executados contra a base antes da correção: **18 casos,
5 aprovados e 13 falhas esperadas**. Quatro das falhas foram observadas com
PostgreSQL real. Depois da correção, **18/18 passaram**, incluindo os seis
casos de banco.

## Validação local reproduzível

Dependências do lockfile existente, SHA-256 comparado antes de reutilizar a
instalação por hard links; sem upgrade ou nova dependência. Não executar
`prisma generate` nessa instalação compartilhada. O modelo não foi alterado.

```bash
node --experimental-strip-types --disable-warning=ExperimentalWarning \
  --import ./tests/register.mjs --test tests/cadastroTransacao.test.ts

TEST_CADASTRO_DATABASE_URL=postgresql://USUARIO@127.0.0.1:PORTA/BASE_DESCARTAVEL \
  node --experimental-strip-types --disable-warning=ExperimentalWarning \
  --import ./tests/register.mjs --test tests/cadastroTransacaoBanco.test.ts

npm run typecheck
npm run lint
npm test
git diff --check
```

O teste PostgreSQL usa somente `TEST_CADASTRO_DATABASE_URL`, sem fallback para
`DATABASE_URL`. Cria um schema aleatório `avl420_catalogo_<uuid>`, aplica nele
os arquivos SQL das **27 migrations da base** e consulta o módulo real com
Prisma Client apontado para esse schema. As constraints e renomeações que
provocam falhas existem somente nesse schema. O cleanup desconecta o Prisma
e remove exclusivamente o schema criado pelo teste.

A migration inicial contém uma criação explícita de `public`. Somente no
runner de teste, essa instrução é redirecionada ao schema aleatório; o arquivo
de produção permanece intacto. O teste confere que a existência de `public`
antes e depois é a mesma. A revisão independente identificou esse limite de
isolamento, que foi corrigido e reavaliado sem achados remanescentes.
Os seis casos foram repetidos em base descartável sem `public`: **6/6
aprovados**. A consulta posterior confirmou `public` ainda ausente e nenhum
schema `avl420_catalogo_*` remanescente.

Foram usados PostgreSQL 18 descartável e UTF-8 em loopback, Node local e Prisma
Client da instalação existente. Nenhuma migration de produção foi executada.
Aplicar os arquivos SQL no schema de teste não é a execução de
`prisma migrate deploy`; o teste não fabrica histórico de deploy.

Cobertura de banco:

1. Criação e leitura real da política com todas as opções e autor normalizado.
2. Atualização das duas entidades e preservação de outra aplicação.
3. Rollback da criação quando uma constraint recusa a política.
4. Rollback da edição, preservando as linhas anteriores e seus timestamps.
5. Tabela de política ausente (`P2021`) sem aplicação parcialmente criada.
6. Coluna de política ausente (`P2022`) sem alteração parcial das linhas.

Os 12 testes sem banco também cobrem erros de unicidade/indisponibilidade,
projeção de política legada, ID controlado pelo servidor e gravação direta do
helper. Eles usam uma fronteira transacional em memória; não substituem os
seis testes reais acima.

A suíte padrão não habilita os seis casos SQL sem a variável específica.
**CI padrão aprovado não comprova execução desses seis casos.** A execução SQL
local e o resultado completo do CI devem ser citados separadamente no PR e no
Linear. Não foi alterado o workflow em revisão no PR #49.

Resultado local da suíte padrão: **352/352**, incluindo os 12 casos novos sem
banco. Typecheck aprovado; lint sem erros, com um aviso preexistente em
`Marca.tsx`; Node mantém aviso preexistente de tipo de módulo. A integração
SQL foi executada separadamente e não está incluída nesses 352 casos.

## Coordenação e compatibilidade

Antes de editar, foram conferidos issue, comentários, PRs e worktrees:

- PR #48 preservado: trata a leitura sob ausência da tabela de políticas.
  Este patch altera somente as funções de escrita do mesmo módulo; a composição
  textual deve ser conferida, sem editar o worktree daquele PR.
- PR #49/AVL-421 preservado: schema, integridade de ambiente, migrations,
  preflight e CI ficam em sua entrega.
- PR #50 preservado: confirmação de logout e seus testes/documentação.
- Recuperação/convites do lote, commits `54e2768` e `5618d5a`, preservados sem
  republicar ou duplicar suas mudanças.
- Consumidores continuam nas tarefas existentes. Nenhum arquivo deles muda.

Compatibilidade de leitura e assinaturas dos helpers é mantida. O endurecimento
de escrita é intencional: administrador precisa ter o esquema de políticas
migrado antes de salvar. Se a política não puder ser gravada, a operação inteira
falha. Não há conversão presumida de dados ou concessão de acesso adicional.

O Hindsight foi consultado por search/list/read; não retornou conteúdo útil
para o Auth. Fontes da decisão foram os arquivos atuais, Linear e os testes.
Nenhuma configuração ou conteúdo do Hindsight foi alterado.

## Estado do objetivo maior

| Requisito | Situação deste incremento |
| --- | --- |
| Modelo e fronteiras centrais | Entidades existentes preservadas; nova garantia transacional para catálogo/política. |
| OIDC, scopes, redirect e ambientes | Preservados; sem novo aceite de protocolo ou ambiente neste patch. |
| Autorização por aplicação e política | Gravação conjunta comprovada localmente; permissões e MFA das ações administrativas preservados. |
| Logout federado | Continua no PR #50; entrega externa e deduplicação concorrente não são comprovadas aqui. |
| Provisionamento e recuperação | Incrementos existentes preservados; atomicidade distribuída e política específica de convite permanecem pendentes. |
| Contratos e OpenAPI | Invariante transacional documentada no contrato v1; OpenAPI continua pendente. |
| Consumidores e remoção do legado | Dependem das tarefas existentes e de evidência de migração; não certificados nem removidos aqui. |

Manter a AVL-420 **In Progress**. O incremento pode ser revisado separadamente,
em PR **draft**, para impedir merge/deploy automáticos sem autorização.
