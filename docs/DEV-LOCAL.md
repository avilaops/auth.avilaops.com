# Desenvolvimento local do Auth

Requer Node.js 22.12+ e PostgreSQL 16+ com `initdb` e `pg_ctl`. Não depende de
Docker, servidor Ávila Ops, SMTP, n8n ou login social. No Windows, a preparação
procura as instalações em Program Files e AppData; `AUTH_DEV_PG_BIN` permite
informar outro diretório. Em Linux/macOS os binários podem estar no PATH.

```sh
npm ci
npm run dev:setup
npm run dev:local
```

Auth: <http://127.0.0.1:3010/login>. Abra outro terminal para o consumidor:

```sh
npm run dev:consumer
```

Consumidor: <http://127.0.0.1:3011>. O acesso passa pelo Auth com Authorization
Code, PKCE S256, state e nonce. A assinatura RS256 do ID token é conferida pelo
JWKS. A lista de empresas usa o endpoint corporativo real com o access token.
O consumidor é uma ferramenta local; não equivale à integração do ERP.

## Dados e configuração

A preparação cria `.env.development.local` com segredos aleatórios e
`.local/auth/` com o cluster PostgreSQL, logs, mensagens e `access.json`.
Esses caminhos são ignorados pelo Git e excluídos do contexto Docker. A senha das contas e o segredo OIDC
ficam em `access.json`; não os copie para issues ou evidências.

| Conta | Cenário |
| --- | --- |
| `dev.admin@example.test` | Administração local |
| `dev@example.test` | Duas empresas autorizadas |
| `dev.zero@example.test` | Sem vínculos corporativos |
| `dev.blocked@example.test` | Vínculo suspenso |

O cluster escuta exclusivamente em `127.0.0.1:55430`, com senha própria.
`avila_auth_dev` guarda o Auth e `avila_portal_dev` guarda as contas sintéticas.
São aplicadas as migrações versionadas e gerado o Prisma Client. A preparação
pode ser repetida: não apaga dados, redefine senhas ou reativa vínculos.
O login sem MFA das fixtures decorre de contas novas sem fatores cadastrados e
da política do ambiente local; os fatores existentes continuam valendo.

Use um checkout sem `.env`/`.env.local`: esses arquivos podem sobrepor a
configuração do Next. Os comandos recusam bancos remotos, domínios de cookie
compartilhados e credenciais de integrações externas.

## Cadastro e recuperação

Em `/criar`, use um endereço sintético, como `pessoa@example.test`. O Auth
emite e consome os links reais, com expiração, uso único e validações existentes.
As mensagens ficam no disco, sem envio externo:

```sh
npm run dev:emails
```

Esse comando mostra os links sensíveis somente no terminal local. Abra o link
de confirmação ou recuperação no navegador. Repetir o cadastro de uma conta
existente permite testar recuperação, conforme o fluxo normal da aplicação.
Para exercitar a origem OIDC, comece por Entrar no consumidor e siga Criar conta
na tela do Auth. Quando o link for aberto em outro navegador, a autenticação
reinicia a partir do produto, sem reaproveitar state/nonce/PKCE anteriores.

A captura exige `AUTH_EMAIL_LOCAL=1`, `NODE_ENV=development` e base HTTP em
loopback. Produção continua usando SMTP/n8n e não habilita captura.

## Verificação

```sh
npm test
npm run test:local
npm run typecheck
npm run lint
npm run build
```

Com os dois servidores DEV em execução e Playwright disponível, o smoke test
real de navegador também pode ser repetido:

```sh
npm run test:browser:local
```

Playwright é opcional: instale-o em seu ambiente de ferramentas ou indique
o caminho do módulo por `AUTH_DEV_PLAYWRIGHT_MODULE`. O script espera
`chromium` exportado por `playwright` ou `@playwright/test`, com o navegador
instalado. Não instala dependências nem navegadores automaticamente.
Resultados e capturas ficam em `.local/auth/`. O teste cria contas sintéticas
e consome mensagens locais; os limites normais de cadastro permanecem ativos.

`test:local` recria somente os schemas dos bancos descartáveis
`auth_contract_test`, `auth_pagination_test` e `avl431_test` no cluster local.
Nunca usa os bancos DEV. Serializa as execuções por advisory lock, aplica as
migrações reais e verifica drift, núcleo, corporativo, vínculos, catálogo,
paginação de 300 mil registros, persistência do portal e isolamento/revogação MCP.

No Windows, encerre o Next antes de `dev:setup`, `test:local` ou `build`:
o Prisma precisa substituir a DLL carregada pelo processo do Next.
Para encerrar o PostgreSQL depois de parar os dois servidores:

```sh
npm run dev:stop
```

## Alcance da evidência

As contas, empresas e mensagens deste ambiente são sintéticas. Ele comprova
o comportamento do código e dos contratos no computador local. Entrega real
de e-mail, Google, AVX/n8n, migração de conexões publicadas e percurso do ERP
em produção continuam exigindo seus ambientes e identidades apropriados.
