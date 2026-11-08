# AVL-420 — Preservar autoridade do cadastro durante migração de políticas

## Entrega

Corrigir a leitura do catálogo quando a relação de política central ainda não
está disponível. A alteração é limitada a `src/lib/cadastro.ts`, seus testes
de regressão e documentação. Não modifica migrations, APIs, consumidores,
credenciais nem dados existentes.

Issue: [AVL-420](https://linear.app/avilaops/issue/AVL-420).
Base inspecionada em 03/11/2026: `2a4989d58fac03a38db4d8f6cc595add69ba3582`.
O repositório foi confirmado pelos recursos da issue e do projeto Auth:
`avilaops/auth.avilaops.com`. PRs #44–47 já estavam integrados; nenhum PR
estava aberto no Auth na consulta inicial. AVL-421, AVL-422, AVL-423 e AVL-424
permanecem responsáveis pelos blocos já existentes, sem duplicação de tarefas.

## Causa e correção

`listarCadastro` e `buscarCadastro` consultavam `aplicacoes` com
`include: { politica: true }`. O tratamento interno tentava leitura legada
somente para `P2022`. Se `politicas_aplicacao` não existisse (`P2021`), o
tratamento externo respondia com `APPS_INICIAIS` sem consultar o catálogo
persistido isoladamente.

Consequência reproduzida: um CRM persistido com login desativado reaparecia
habilitado com o host e acesso aberto da configuração de fábrica. Aplicações
personalizadas desapareciam e aplicações removidas podiam reaparecer.

A correção aceita os dois códigos de esquema ausente na primeira leitura e
consulta o mesmo catálogo sem a relação. A projeção legada já existente mantém
restrição, papel e MFA. Banco migrado continua priorizando a política central;
erros operacionais continuam sendo propagados. O bootstrap preexistente para
ausência do esquema do próprio catálogo foi preservado.

## Verificação reproduzível

Ambiente: desenvolvimento local, Node `v24.21.0`, dependências do lockfile por
`npm ci --no-audit --no-fund`, Prisma Client `6.19.3` gerado com
`npm run db:generate`. O CI do projeto usa Node 22.

```bash
node --experimental-strip-types --disable-warning=ExperimentalWarning \
  --import ./tests/register.mjs --test tests/cadastroPoliticaLegada.test.ts
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

- Suíte inicial sem a mudança: 340 testes aprovados.
- Teste novo antes da correção: 13 cenários, 8 aprovados e 5 falhas esperadas
  no ramo `P2021`, incluindo reativação indevida do CRM.
- Teste novo após a correção: 13 aprovados.
- Suíte após a correção: 353 testes aprovados, zero falhas.
- Typecheck aprovado; lint sem erros, com aviso preexistente de `<img>` em
  `src/components/Marca.tsx`. Node emite o aviso preexistente de tipo de módulo.
- `npm run build` aprovado, incluindo geração do Prisma Client e build Next.js.
- `git diff --check` aprovado antes do commit.

O teste novo executa cadastro, projeção de política e decisão de acesso reais,
substituindo apenas a fronteira Prisma por armazenamento sintético e erros da
classe real do Prisma. Não estabelece conexão com banco. As suítes opcionais
dependentes de `TEST_DATABASE_URL` e `TEST_PORTAL_DATABASE_URL` não foram
habilitadas na execução local; o total de testes não comprova integração SQL.
O CI deste patch deve ser conferido no PR; o build local não comprova CI nem
publicação.

## Classificação do objetivo maior

Esta matriz registra o estado observado nos arquivos da base, não uma
certificação de todos os critérios de aceite da AVL-420.

| Requisito | Classificação | Evidência e limite |
| --- | --- | --- |
| Separação de catálogo, ambiente, cliente, conta, permissão, sessão, política e auditoria | Parcialmente implementado | Modelos no Prisma, conta em banco separado e contrato v1; a rodada corrige um caminho de compatibilidade de leitura. |
| Modelo e migrations preservando dados | Parcialmente comprovado | Migração `20261102190000_nucleo_aplicacoes_oidc` faz backfill aditivo; validação SQL desta rodada não executada. |
| Authorization Code, PKCE, scopes, discovery, JWKS e troca de código | Parcialmente comprovado | Rotas `oauth`, `.well-known/openid-configuration`, `api/auth/exchange` e testes existentes; fluxo externo de consumidores não executado. |
| Redirect e pós-logout por cliente/ambiente | Parcialmente implementado | Relações e destinos normalizados; PR #45 trata revogação e atomicidade, sem repetir sua implementação. |
| Autorização por aplicação, empresa, usuário e papel | Parcialmente implementado | `permissoes.ts`, `politicaAplicacao.ts`, domínio corporativo e PR #47; requisito de empresa no provisionamento de acesso precisa reconciliação. |
| Logout local e federado assinado/idempotente | Parcialmente comprovado | Token RS256 e `jti` cobertos em `avisoDeLogout.test.ts`; entrega, deduplicação no consumidor e proteção do GET não certificadas. |
| Provisionamento idempotente, versionado e auditado | Parcialmente comprovado | Contrato corporativo v2, versões monotônicas e rotas existentes; convite compartilha caminho de recuperação e merece correção separada. |
| Contratos HTTP/OpenAPI e documentação | Parcialmente implementado | Contratos centrais/corporativos Markdown presentes; nenhum artefato OpenAPI/Swagger encontrado no checkout. |
| Matriz de compatibilidade e migração de consumidores | Parcialmente implementado | Checklist no contrato e subtarefas ERP/Mail/CRM; falta matriz por versão, ambiente e evidência para todos os consumidores. |
| Testes de contrato/integração de todos os consumidores e seus builds | Dependência externa a esta entrega | Repositórios dos consumidores ficam nas tarefas existentes; esta rodada valida o Auth e não atesta seus builds. |
| Remoção das compatibilidades legadas | Pendente por dependência | Só após evidência de migração de cada consumidor; nenhuma remoção executada. |
| Preservar cadastro sob ausência da tabela de política | Implementado e comprovado localmente | 13 regressões novas; sem teste PostgreSQL deste caso nesta rodada. |

## Pendências específicas observadas

Os pontos abaixo já aparecem na revisão do
[PR #44](https://github.com/avilaops/auth.avilaops.com/pull/44).
A leitura da base confirma caminhos ainda presentes; não foram reproduzidos
operacionalmente nesta rodada nem corrigidos por este patch:

- `GET /api/auth/logout` chama `encerrar` antes de validar qualquer parâmetro
  de cliente ou obter confirmação. Próximo corte: proteção de logout iniciado
  por navegação externa, preservando os fluxos dos consumidores existentes.
- `/api/auth/recuperar` consome o token antes de verificar
  `permiteRecuperacao`, e provisionamento emite convites pelo mesmo mecanismo.
  Separar a finalidade do convite e verificar política antes de consumir exige
  coordenação com o provisionamento e testes próprios.
- Provisionamento de acesso valida `empresa` como texto, enquanto a entrada
  exige vínculo obtido por `contaPossuiEmpresa`; não comprova criação do vínculo.
- `modo_acesso` tem default SQL/Prisma `restrito`, desconhecido pela
  normalização. Corrigir exige migration aditiva, sem editar a já integrada.

Essas pendências impedem certificar o núcleo inteiro como concluído. A issue
pai deve permanecer **In Progress**, com este patch em revisão independente.

## Ferramentas e coordenação

A reserva de arquivos e o diagnóstico foram registrados na AVL-420 antes da
edição. Não houve outro agente nesta rodada. O checkout original e sua
exclusão preexistente de `CLAUDE.md` foram preservados; o trabalho ocorreu em
worktree isolado na branch `codex/avl-420-cadastro-politica`.

`get_agent_context` falhou com `McpServerError: Tool get_agent_context not found`.
As alternativas foram descrição, comentários, subtarefas e recursos do projeto
Linear, arquivos e revisão do GitHub. `gh` retornou bloqueio por política do
servidor; GitHub MCP e git SSH permitiram continuar.

O workflow `merge-automatico.yml` integra PRs prontos após CI e dispara
publicação. A entrega deve permanecer em PR **draft** para permitir revisão e
CI dentro da autorização de desenvolvimento. Nenhum merge, deploy ou operação
em produção faz parte desta rodada.
