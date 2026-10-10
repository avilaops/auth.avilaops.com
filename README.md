# auth.avilaops.com

Login único do portfólio Avila Ops. Uma tela, um OAuth client no Google, um
cookie de sessão válido em todos os `*.avilaops.com`.

Arquitetura e configuração do Google Console: `../docs/plataforma/AUTH-SSO.md`.

## Como um app entra no SSO

### 1. Registrar o app

No painel, em **Aplicações → Nova** (`/admin/apps/novo`): identificador, nome e
endereço. O identificador é o que vai em `?app=` e não muda depois.

- **Recebe sessão do login único** desmarcado é cadastro de site ou de produto
  com login próprio: existe na lista e ninguém entra por aqui.
- **Só a equipe da Avila Ops** fecha o app para clientes; é assim que
  `app.avilaops.com` fica fechado.
- **Cliente só entra se for liberado** nasce marcado. Cada cliente é liberado
  na ficha da conta; desmarcar abre o app a qualquer conta válida.

App que não está no cadastro não consegue nem iniciar login. A lista mora na
tabela `aplicacoes` e deixou de ser código em 06/10/2026; o que substitui a
revisão em diff é a trilha em **Atividade** (`app_criado`, `app_alterado`,
`app_removido`), com quem mexeu e o antes e depois.

`APPS_INICIAIS`, em `src/lib/apps.ts`, é a lista como era. Só é usada se a
tabela ainda não existir no banco (imagem nova no ar antes da migração).

### 2. Mandar o usuário deslogado para cá

```
https://auth.avilaops.com/login?app=erp&returnTo=https://erp.avilaops.com/painel
```

### 3. Validar a sessão no app

O cookie `avila_sso` chega sozinho (é de `.avilaops.com`). Em Node, verificar
localmente, sem round-trip:

```ts
import jwt from "jsonwebtoken";

export function lerSessaoSSO(req: Request) {
  const token = /* cookie avila_sso */;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.SSO_JWT_SECRET!, {
      issuer: "auth.avilaops.com",
    }) as {
      sub: string;
      email: string;
      nome: string;
      papel: "ADMIN" | "CLIENTE";
      /** Segundo fator conferido nesta sessão. Ausente em token antigo. */
      mfa?: boolean;
    };
  } catch {
    return null;
  }
}
```

Quem não roda Node (ou é front estático) usa `GET /api/session` com
`credentials: "include"`.

Com `?app=<id>` a resposta traz `permitido`: se a conta pode entrar naquele
app, pela mesma regra do login. App **restrito** deve perguntar por aqui (ou
conferir por conta própria quem é a pessoa): o cookie vale em todo
`*.avilaops.com`, então quem logou em outro sistema chega com sessão válida
sem nunca ter sido liberado.

```
GET https://auth.avilaops.com/api/session?app=lojas-avilaops-com
→ { "autenticado": true, "sessao": { … }, "permitido": false }
```

### 4. Checar o papel no próprio app

**O cookie vale para todos os subdomínios.** Presença de sessão não é
autorização, significa apenas "esta pessoa logou em algum sistema Avila Ops".
Um app restrito tem de conferir o papel também:

```ts
if (sessao.papel !== "ADMIN") return redirect("/sem-acesso");
```

O `auth` já barra no login, mas essa segunda checagem é o que protege contra
alguém que obteve a sessão por outro app e vem direto na URL.

O claim `mfa` diz se aquela sessão passou pelo segundo fator. App que trate
dado sensível pode exigi-lo — e, em vez de recusar, mandar elevar:

```ts
if (sessao.papel === "ADMIN" && !sessao.mfa) {
  return redirect(`https://auth.avilaops.com/api/auth/mfa/elevar?app=erp&returnTo=${url}`);
}
```

Marcar "Exigir verificação em duas etapas de todo mundo" no cadastro do app faz
o próprio `auth` cuidar disso no login, sem código no app.

## Provisionamento de sistema para sistema

App que só entra pelo login único (o TMS) libera a própria gente sem passar pelo painel:

```
POST   /api/provisionamento/acessos        { "email", "nome", "cpf"?, "telefone"? }
DELETE /api/provisionamento/acessos?email=
Authorization: Basic base64(client_id:segredo)     # o mesmo cliente OIDC do /oauth/token
```

- `POST` garante a conta (cria como `CLIENT` se não existir) e libera o app **do próprio cliente**. Responde `{ email, criada, convite }`.
- `convite` é um link de uso único, válido por 7 dias, para a pessoa definir a senha. Só vem quando a conta foi **criada nesta chamada**; para conta que já existia vem `null`, senão quem administra uma empresa no app poderia pedir o link da conta de outra pessoa.
- `DELETE` revoga a liberação do app. A conta continua existindo para os outros sistemas.
- Cada cliente só mexe no app dele. Tudo fica em **Atividade**, com autor `app:<client_id>`.

## Painel `/admin` (estilo Clerk)

Quem é ADMIN (ou está em `SSO_SUPERADMINS`) entra em `https://auth.avilaops.com/admin` e vê:

- **Contas**, todas as contas de `portal_clients` (a base do `app.avilaops.com`; equipe e clientes), com papel,
  estado da senha (provisória/definida), último login e busca por nome/e-mail/CPF.
- **Conta**, editar dados e papel; definir senha; gerar senha provisória; gerar
  link de recuperação (1 h, uso único); liberar/revogar apps restritos; atividade;
  remover.
- **Aplicações**, o cadastro de aplicações e sites: criar, editar, desativar,
  remover, e quem tem acesso explícito a cada uma.
  Embaixo da situação informada vai a **conferência**: o painel pede
  `https://host/` de cada aplicação cadastrada como no ar ou fora do ar e guarda
  se houve resposta (tabela `conferencias`, `src/lib/conferencia.ts`). Roda
  depois de a lista ser aberta, no máximo a cada 10 minutos por aplicação, com
  5 segundos de espera. Qualquer código abaixo de 500 conta como resposta, então
  ela diz que o endereço atende, não que a aplicação funciona por dentro. A
  situação informada continua sendo a que decide o login; a conferência só
  aponta quando as duas discordam (filtro "Cadastro e conferência").
- **Atividade**, auditoria: logins ok/falhos, sem permissão, trocas de senha,
  ações do admin.

Senha **não é legível** (bcrypt). O painel gera outra e mostra **uma vez**.

### Permissões

- `papelExigido: "ADMIN"` → só equipe.
- `restrito: true` → cliente só entra se liberado no painel (tabela `permissoes`).
- Sem nada → qualquer conta válida.

### Fluxos de senha

- Conta nova nasce com senha provisória; o login redireciona para `/trocar-senha`.
- `/recuperar/[token]` define senha nova pelo link gerado no painel e já loga.

### Variáveis novas

- `PORTAL_DATABASE_URL` - banco do `app.avilaops.com` (`cliente_portal`), com escrita em `portal_clients`.
- `SSO_SUPERADMINS` - opcional, e-mails que podem abrir `/admin`.
- `AUTH_ENCRYPTION_KEY` - 32 bytes hex; cifra os secrets dos conectores e os
  segredos TOTP do segundo fator.
- `MFA_EQUIPE` - opcional; `opcional` afrouxa a exigência de 2FA para a equipe
  durante a migração. Padrão: obrigatório.

Migração: `npx prisma migrate deploy` (cria `permissoes`, `eventos`, `tokens_recuperacao`).

## Verificação em duas etapas (TOTP)

Senha sozinha abria o painel de contas, os conectores e, por tabela, todo app
que confia no cookie `avila_sso`. Agora a **equipe** (papel `ADMIN` do SSO, o
que cobre OWNER, SOCIO e ADMIN) prova também a posse do celular.

Padrão TOTP (RFC 6238): 6 dígitos, 30 segundos, HMAC-SHA1 — Google
Authenticator, 1Password, Bitwarden, Authy. Sem SMS, sem operadora, sem sinal.

### Onde o fator entra

**Antes de a sessão existir**, em todos os caminhos de entrada: senha, senha da
caixa de e-mail, login social e link de recuperação. Os quatro passam pelo
mesmo `src/lib/entrada.ts` — emitir o cookie e "completar depois" seria dar
sessão válida em todo `*.avilaops.com` a quem parasse no meio.

```
senha ok ──> falta fator? ──não──> cookie avila_sso (mfa: true|false) ──> destino
                  │
                  ├─ tem fator  ──> /mfa           (código de 6 dígitos)  ──┐
                  └─ não tem    ──> /mfa/cadastrar (QR + confirmação)     ──┘
                                                                           │
                                            cookie avila_sso (mfa: true) <─┘
```

Entre os dois passos existe um **bilhete de desafio**, no cookie
`avila_sso_desafio`: 10 minutos, só do host `auth.avilaops.com` (sem `domain`,
não vaza para os subdomínios) e assinado com uma chave **derivada** de
`SSO_JWT_SECRET`, sob o emissor `auth.avilaops.com/desafio`. A derivação é o
que impede o truque óbvio: copiar o bilhete para o cookie `avila_sso` e pular a
segunda etapa. Nenhum app consumidor precisa saber que ele existe — quem
confere o emissor já recusa.

### Sessão que nasceu antes do fator

O cookie vale 8 horas, então existe sessão em campo sem 2FA. Ela não é
derrubada: é **elevada**. `/login`, `/admin` e `/oauth/authorize` mandam para
`/api/auth/mfa/elevar`, que pede só a metade que falta e devolve ao destino.

### Códigos de recuperação

A ativação entrega 10 códigos de uso único (`ABCD-EFGH`), mostrados **uma vez**,
guardados só como hash SHA-256. Entram no mesmo campo do desafio, no lugar do
aplicativo. Cada uso queima o código; `/conta` gera uma lista nova (a antiga
morre na hora) e avisa quando restam poucos.

Perdeu o celular **e** os códigos: o painel remove o fator em
`/admin/contas/[id]` e a pessoa cadastra outro aparelho no próximo login. É o
único caminho que dispensa apresentar um código — confirme por um canal fora do
e-mail, que é exatamente o que um invasor teria. Fica em `eventos` com autor.

### O que a própria pessoa faz em `/conta`

Ativar, gerar códigos novos, trocar de aparelho e (só quem não é obrigado)
desativar. Tudo exige um código válido **na hora** — sessão aberta não basta,
senão quem senta num computador destrancado desfaz em dois cliques a proteção
que existe para esse dia. Conta da equipe não desativa: troca de aparelho.

### Configuração

- `AUTH_ENCRYPTION_KEY` — a mesma dos conectores; cifra o segredo TOTP em
  repouso (AES-256-GCM). **Sem ela a exigência fica suspensa**: ninguém
  conseguiria cadastrar, e exigir o que não dá para cadastrar trancaria a
  equipe inteira para fora. O painel avisa em vermelho e o evento
  `mfa_indisponivel` registra.
- `MFA_EQUIPE=opcional` — afrouxa a obrigação durante a migração. Quem já
  ativou continua sendo desafiado: fator ativo nunca deixa de valer.
- "Exigir verificação em duas etapas" no cadastro do app — exige o fator de
  **qualquer** conta naquele app, cliente inclusive.

Migração: `npx prisma migrate deploy` (cria `segundos_fatores` e
`codigos_backup`).

### Auditoria

`mfa_ativado`, `mfa_desativado`, `mfa_resetado`, `mfa_desafiado`,
`mfa_cadastro_exigido`, `mfa_ok`, `mfa_falhou`, `mfa_backup_usado`,
`mfa_codigos_gerados`, `mfa_indisponivel` — todos em `/admin/eventos`.

### Saúde e suspensão visível

Suspender a exigência (falta de chave ou migração pendente) é o comportamento
certo — mas suspensão silenciosa é controle perdido sem ninguém notar. Três
lugares contam a verdade:

- `GET /api/saude` — `{ ok, degradado }` para qualquer um; **503 só quando o
  banco não responde**, que é a única falha que reiniciar o container resolve.
  Com sessão de admin, a resposta abre o detalhe (chave, migrações, latência).
  Sem ela o detalhe não sai: saber que o segundo fator está suspenso é
  exatamente o que faria alguém escolher a hora de tentar senha.
- O healthcheck do `docker-compose.yml` aponta para lá. Antes pedia `/login`
  **anônimo** — e em 19/09 ficou verde durante uma queda inteira, porque o
  trecho que explodia só rodava com cookie de sessão. Healthcheck que só sabe
  responder sobre quem não está logado não vigia o login.
- `/admin` abre com uma faixa vermelha enquanto o fator estiver suspenso,
  dizendo qual das duas metades falta.

### Trava de tentativas

8 tentativas por conta a cada 15 minutos. Estourado o limite, o bilhete de
desafio é **descartado** e a pessoa recomeça pela senha: adivinhar 6 dígitos
deixa de ser uma corrida que dá para continuar de onde parou. (O contador fica no banco, tabela `tentativas`: sobrevive a deploy e é o mesmo
para todas as instâncias. Se o banco não responder, cai para a memória do
processo em vez de derrubar o login. As janelas vencidas são apagadas pelo
próprio contador, no máximo uma vez por hora por processo.)

## Conectores de login (Google, Apple, Microsoft, GitHub, LinkedIn, gov.br, Facebook, Discord)

Catálogo em `src/lib/provedores.ts`; ligar/desligar e credenciais em
`/admin/conectores` (tabela `conectores`, secret cifrado com
`AUTH_ENCRYPTION_KEY`). Ligar um conector faz o botão aparecer em `/login` na
hora. Redirect URI de cada um: `https://auth.avilaops.com/api/auth/{provedor}/callback`.

### Cruzamento de identidades

A conta é sempre uma linha de `portal_clients` (uma por e-mail). A tabela
`vinculos` liga `provedor + id no provedor` a essa conta. Quem entra com senha
hoje e com Google amanhã é a **mesma** conta, com as mesmas permissões.

No login social (`src/lib/vinculos.ts`):

1. vínculo já existe → entra;
2. e-mail **verificado** pelo provedor bate com conta existente:
   - cliente → vincula e entra;
   - equipe (ADMIN) → recusa (`vincule_primeiro`): a pessoa entra com senha e
     vincula em `/conta`. Provedor externo nunca decide quem é da casa;
3. e-mail verificado sem conta → cria conta CLIENTE (senha aleatória, sem
   troca obrigatória) e vincula;
4. sem e-mail verificado → recusa. Fundir por e-mail que o provedor não garante
   seria sequestro de conta.

`/conta` é a página do próprio usuário (equipe ou cliente): ver e vincular /
desvincular logins, trocar senha. O admin vê e desvincula em
`/admin/contas/[id]`.

A página é dividida em seções, uma por tela, escolhidas por `?secao=`
(`src/lib/secoesDaConta.ts`): **Início** (caixas de e-mail e sistemas),
**Meus dados** (`?secao=dados`) e **Segurança** (`?secao=seguranca`: formas de
entrar e verificação em duas etapas). A aba **Meta** leva a `/conta/meta`.
Vincular uma rede social e trocar a senha devolvem a pessoa à Segurança.

### Apple

Não tem client secret fixo: o auth assina um JWT ES256 com a chave `.p8` a cada
login. O callback aceita `POST` (form_post) e o cookie de fluxo vai com
`SameSite=None` só para a Apple.

## Conexão de ativos da Meta (`/conta/meta`)

O mesmo app da Meta do login com Facebook serve a uma segunda coisa: a pessoa,
já logada, autoriza a casa a enxergar as Páginas, contas do Instagram, números
de WhatsApp Business, contas de anúncio e catálogos dela. É o que os outros
sistemas (atendimento, loja, anúncios) vão usar — e é a função que a análise do
app na Meta precisa ver funcionando para liberar cada permissão.

Não é login. O login pede `email` e `public_profile` e joga o token fora; a
conexão guarda um token de longa duração (~60 dias), cifrado com
`AUTH_ENCRYPTION_KEY`, em `conexoes_meta`. Os ativos ficam em `ativos_meta`
(token da Página também cifrado). Nenhum token vai para a tela.

| Caminho | O que faz |
| --- | --- |
| `GET /api/meta/conectar` | exige sessão; manda ao diálogo da Meta com as permissões configuradas |
| `GET /api/meta/callback` | troca o código, grava a conexão e lê os ativos |
| `/conta/meta` | mostra o que foi autorizado e os ativos; atualizar e desconectar |
| `POST /api/meta/exclusao` | callback de exclusão de dados da Meta; devolve o comprovante |
| `POST /api/meta/desautorizar` | callback de desautorização (a pessoa removeu o app) |
| `/exclusao/{codigo}` | comprovante público do pedido de exclusão |

Os dois callbacks só aceitam `signed_request` assinado com o segredo do app.
A exclusão apaga a conexão, os ativos e o vínculo de login com Facebook; a
conta em `portal_clients` não é apagada.

Configuração em `/admin/conectores/facebook`, que vale mesmo com o botão de
login desligado:

- **Permissões da conexão de ativos**: lista separada por espaço. Vazio usa o
  padrão de `ESCOPOS_PADRAO` em `src/lib/meta.ts`. Permissão sem acesso avançado
  aprovado só é concedida por quem tem função no app (admin, desenvolvedor,
  testador) — suficiente para gravar o screencast da análise.
- **Configuration ID**: opcional, para o Login do Facebook para Empresas.

No painel da Meta é preciso cadastrar as três URLs mostradas nessa mesma tela:
a redirect URI `/api/meta/callback` e os callbacks de exclusão e de
desautorização.

O que cada permissão mostra hoje, e portanto o que dá para pedir na análise:

| Permissão | Na tela |
| --- | --- |
| `pages_show_list` | lista de Páginas |
| `pages_read_engagement` | seguidores de cada Página |
| `instagram_basic` | conta do Instagram ligada à Página |
| `business_management` | negócios (Business Manager) |
| `ads_read` | contas de anúncio |
| `whatsapp_business_management` | contas e números do WhatsApp Business |
| `catalog_management` | catálogos e quantidade de produtos |

A entrega do token aos sistemas está em [Integrações](#integrações-adminintegracoes).
Ainda **não** existe ação de escrita no auth (enviar mensagem, publicar, criar
anúncio): isso é trabalho de cada sistema consumidor, e permissão de escrita só
deve ser pedida à Meta quando o sistema que a usa tiver a tela pronta.

Migração: `npx prisma migrate deploy` (cria `conexoes_meta`, `ativos_meta` e
`exclusoes_meta`). Enquanto não rodar, `/conta/meta` avisa que a conexão está
indisponível e o resto do auth segue igual.

## Integrações (`/admin/integracoes`)

Todo sistema que fala com o auth usando credencial própria é uma integração:
um identificador (`client_id`) e um segredo (`client_secret`). Serve para duas
coisas, que podem andar juntas ou separadas:

- **Login por OIDC** (`/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`),
  para sistema que não lê o cookie `avila_sso`: software de terceiro ou produto
  da casa em domínio de cliente.
  O `id_token` é assinado em RS256; a chave pública fica em `/oauth/jwks`, que
  é o `jwks_uri` de `/.well-known/openid-configuration`. O par é criado no
  primeiro uso e guardado em `chaves_oidc`, com a privada cifrada por
  `AUTH_ENCRYPTION_KEY` (`src/lib/chaveOidc.ts`). Sem essa variável ou sem a
  migração, o `id_token` sai em HS256 com o segredo da sessão e a descoberta
  não anuncia `jwks_uri`. O access token é sempre HS256: só o
  `/oauth/userinfo` o lê. Não há rotação de chave pelo painel.
- **Leitura da conexão da Meta** (`GET /api/meta/ativos`), só para integração
  marcada com essa permissão.

O cadastro é feito pelo painel, sem commit nem deploy. O segredo é gerado aqui,
mostrado uma vez e guardado só como hash (tabela `clientes_oidc`); se perder,
gera-se outro e o anterior deixa de valer. Desativar recusa login e chamadas
na hora, sem apagar o cadastro.

Notas e TMS continuam como integrações fixas em `src/lib/oidc.ts`, com segredo
em variável de ambiente. Um cadastro do painel com o mesmo identificador tem
precedência sobre a entrada do código.

### API da conexão da Meta

```
GET /api/meta/ativos?email=<e-mail da conta>
Authorization: Basic base64(client_id:client_secret)
```

Devolve o token de usuário da Meta e os ativos da conta (Páginas com o token
de cada uma, Instagram, WhatsApp, contas de anúncio, catálogos, negócios).

| Resposta | Significado |
| --- | --- |
| 200 | conexão entregue |
| 401 | identificador ou segredo inválidos |
| 403 | a integração não tem a permissão de ler a Meta |
| 404 | a conta não conectou a Meta |
| 409 | a conexão venceu; o cliente precisa conectar de novo em `/conta/meta` |

Cada leitura fica em `eventos` (`meta_token_entregue`, com a conta e a
integração). Se o token está a menos de 15 dias do vencimento, ele é renovado
antes de ser entregue.
## Caixa de e-mail junto com a conta (n8n)

Ao criar uma conta em `/admin/contas/nova` dá para pedir a caixa de e-mail no
mesmo formulário: **genérica** (`@avilaops.com`, equipe) ou **empresarial**
(domínio do cliente hospedado no Avila Mail — `brilhax.com`, `comandeiro.com.br`…).
A lista de domínios vem de `mail_domains` (status `active`) pelo
`MAIL_DATABASE_URL`, que já existia para o login por senha da caixa.

O que acontece:

1. o auth cria a conta em `portal_clients` (senha provisória de 12 caracteres);
2. manda `{ domain, username, password, displayName, ownerEmail, notifyTo, autor }`
   para o fluxo **"Auth — Criar caixa de e-mail"** no n8n
   (`N8N_CAIXA_WEBHOOK_URL`, header `x-avila-webhook-token` = `N8N_CAIXA_WEBHOOK_TOKEN`)
   e espera a resposta (até 40 s);
3. o n8n chama `POST /api/v1/mailboxes` do mail.avilaops.com com a credencial
   de provisionamento e devolve `{ ok, address }` ou `{ ok: false, erro }`;
4. a caixa nasce com a **mesma senha provisória** da conta, troca obrigatória
   no primeiro acesso, e a conta vira dona (`owner_email`) — abre o webmail
   pelo login único. O aviso de boas-vindas (sem senha) vai para o e-mail da conta.

Falha na caixa **não** desfaz a conta: a tela avisa, o evento `caixa_falhou`
fica na auditoria e a página da conta tem o botão **Criar caixa** para tentar
de novo (aí a caixa ganha senha provisória própria, mostrada uma vez).

Por que n8n e não a API do mail direto: a API escuta no loopback do host; do
container do auth a chamada sairia pela internet e voltaria (hairpin pelo
Cloudflare), que é lento e falha. O n8n roda em outro VPS e já tem a credencial.

## Rotas

| Rota | Para quê |
| --- | --- |
| `GET /login?app=&returnTo=` | A tela. Se já houver sessão válida, pula direto para o `returnTo`. |
| `GET /api/auth/google?app=&returnTo=` | Inicia o fluxo (grava `state` + `nonce`). |
| `GET /api/auth/google/callback` | Retorno do Google. **É a única URI registrada no Console.** |
| `POST /api/auth/logout?app=&returnTo=` | Logout global. POST de propósito, em GET, uma `<img>` desloga o usuário. |
| `GET /api/session` | Sessão corrente em JSON. CORS restrito a `*.avilaops.com`. |
| `POST /api/auth/exchange` | Troca código de uso único por token. App nativo. |
| `POST /api/auth/trocar-senha` | Usuário logado troca a própria senha (exige a atual). |
| `POST /api/auth/recuperar` | Define senha por link de recuperação e loga. |
| `GET /api/auth/{provedor}` | Inicia login social (`?app=&returnTo=`; `&vincular=1` liga à sessão atual). |
| `GET/POST /api/auth/{provedor}/callback` | Volta do provedor. Única URI registrada em cada console. |
| `GET /mfa` | Desafio do segundo fator (código de 6 dígitos ou de recuperação). |
| `GET /mfa/cadastrar` | Cadastro obrigatório do fator, no meio do login. |
| `POST /api/auth/mfa/iniciar` | Devolve o QR e o segredo de quem está cadastrando. |
| `POST /api/auth/mfa/cadastrar` | Confirma o cadastro e entrega os códigos de recuperação. |
| `POST /api/auth/mfa/verificar` | Confere o código e abre a sessão. |
| `POST /api/auth/mfa/desativar` | Desativa ou troca de aparelho (exige código válido). |
| `POST /api/auth/mfa/codigos` | Gera códigos de recuperação novos (exige código válido). |
| `GET /api/auth/mfa/elevar` | Pede o fator para uma sessão que nasceu sem ele. |
| `GET /api/saude` | Saúde do serviço. 503 só quando o banco não responde. |
| `GET /conta` | Página do usuário: logins vinculados, trocar senha, segundo fator. |
| `GET /admin/*` | Painel de contas, apps, conectores e atividade. Só ADMIN. |

## App nativo (irlquest)

Build standalone não recebe o cookie: o navegador do sistema não o compartilha
com o app. Para esses, o registro leva `deepLink`, e o callback entrega um código
de uso único em vez de cookie:

```
irlquest://auth/callback?code=<uso-único-60s>
```

O app troca em `POST /api/auth/exchange` `{ "code": "..." }` e recebe
`{ "token": "..." }`. O código é gravado só como hash SHA-256 e consumido em
`updateMany` com `usadoEm: null` no filtro, dois resgates simultâneos disputam
a linha e só um vence.

Assim continua **uma** redirect URI no Google, sem client Android/iOS separado.

## Variáveis

Ver `.env.example`. As que merecem atenção:

- `SSO_JWT_SECRET` - o mesmo valor precisa estar em todo app que valide o cookie
  localmente. Trocar este segredo desloga todo mundo, em todos os sistemas.
- `SSO_COOKIE_DOMAIN` - `.avilaops.com` em produção (o ponto inicial é o que
  espalha para os subdomínios). **Vazio em desenvolvimento**: em `localhost` não
  existe domínio pai, e preencher faz o navegador recusar o cookie, o login
  "não faz nada" e não há erro visível.

## Desenvolvimento

```bash
cp .env.example .env    # preencher; deixar SSO_COOKIE_DOMAIN vazio
npm install
npx prisma migrate dev
npm run dev             # porta 3010
```

### Testes

```bash
npm test          # não precisa de banco nem de rede
npm run lint
npx tsc --noEmit
```

A suíte cobre o que erra em silêncio: os vetores do RFC 6238, o anti-replay do
TOTP, a cifra dos segredos em repouso, a validação de `returnTo` (o open
redirect) e a propriedade que sustenta o 2FA — **o bilhete de desafio não vale
como cookie de sessão, e vice-versa**.

O gerador de QR tem retrato (hash da matriz) e invariantes de estrutura. O
retrato trava a saída exata: mexer no codificador e quebrar o desenho aparece no
diff, não na câmera de alguém. Foi assim que apareceu um módulo de temporização
apagado pela reserva da área de formato — leitor tolerante lia; um leitor
rigoroso, não.

Os testes que precisam de banco ficam atrás de `TEST_DATABASE_URL` e são pulados
sem ela. A variável é separada de propósito: eles criam e apagam linhas, e não
podem rodar por acidente contra o banco onde estão os fatores da equipe.

```bash
createdb avilaops_auth_teste
TEST_DATABASE_URL=postgresql://.../avilaops_auth_teste npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://.../avilaops_auth_teste npm test
```

Para testar sem banco e sem Google, as rotas de tela e a validação de `returnTo`
funcionam isoladas:

```bash
npm run build && npx next start -p 3010
curl -s "http://127.0.0.1:3010/login?app=app" | grep -o "Entrar em [^<]*"
```

## Estado atual

Em produção desde outubro de 2026: login por senha e por conectores, painel
`/admin`, verificação em duas etapas, provedor OIDC, cadastro de aplicações e
de integrações, conexão de ativos da Meta e a API que a entrega.

O que falta está em [`ROADMAP.md`](ROADMAP.md). O deploy é manual, pelo caminho
descrito em `infra/BUILD-MANUAL.md`.
## Portas

O container escuta na **3010**; o host publica em **3060** (a 3010 do VPS já é do
`cifrainssdeobras.com.br`). O Caddy tem de apontar para `127.0.0.1:3060`:

```caddy
auth.avilaops.com {
	reverse_proxy 127.0.0.1:3060
}
```

Em desenvolvimento local `npm run dev` sobe direto na 3010, sem container.
