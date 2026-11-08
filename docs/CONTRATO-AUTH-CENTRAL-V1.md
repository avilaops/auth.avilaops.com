# Contrato central do Auth v1

Este documento define a fronteira do `auth.avilaops.com` como autoridade
central de identidade, autenticação, autorização de entrada e integração dos
produtos Ávila Ops.

## Autoridade

O Auth é a fonte oficial de:

- identidade da conta;
- autenticação e fatores de segurança;
- sessão central e revogação;
- autorização de entrada em aplicações cadastradas;
- clientes OIDC/OAuth e seus destinos permitidos;
- scopes e claims emitidos;
- logout federado;
- provisionamento de acesso autorizado;
- eventos de segurança e auditoria do contrato.

ERP, CRM, Lojas, Mail, TMS, Notas e outros consumidores devem se adequar a
este contrato. O Auth não replica regras específicas do consumidor para manter
integrações incompatíveis funcionando.

## Fronteiras de domínio

As entidades têm responsabilidades distintas:

| Entidade | Responsabilidade | Não deve conter |
| --- | --- | --- |
| Aplicação | Produto cadastrado no catálogo | segredo, sessão ou regra comercial do produto |
| Ambiente | Instância de produção, homologação ou desenvolvimento | identidade de usuário |
| Cliente OIDC | Sistema técnico autorizado a falar com o Auth | dados comerciais do consumidor |
| Redirect URI | Destino exato autorizado para um cliente | curingas ou redirecionamento externo |
| Conta | Identidade central da pessoa | perfil comercial específico do produto |
| Permissão | Acesso da conta a uma aplicação/empresa | senha ou segredo OIDC |
| Sessão | Estado de autenticação e revogação | autorização implícita não auditada |
| Provisionamento | Sincronização autorizada com o consumidor | decisão de identidade fora do Auth |
| Auditoria | Evidência das decisões e eventos | segredo, token em claro ou senha |

## Invariantes obrigatórias

1. `client_id` identifica um único cliente OIDC.
2. Todo `redirect_uri` é comparado por igualdade exata.
3. Redirect URI não aceita fragmento, curinga ou esquema inseguro.
4. Código de autorização é de uso único e expira rapidamente.
5. `state`, `nonce`, `audience` e PKCE são verificados no servidor quando
   presentes ou exigidos pela política do cliente.
6. O Auth nunca entrega segredo de cliente novamente depois da criação ou
   rotação.
7. Acesso a uma aplicação exige uma decisão explícita da política de acesso.
8. Conta autenticada não implica automaticamente acesso a todos os produtos.
9. Provisionamento é idempotente, limitado ao cliente autorizado e auditado.
10. Logout federado é best-effort, assinado, idempotente e não mantém a sessão
    central aberta porque um consumidor está indisponível.
11. Tokens não carregam dados comerciais que possam ser consultados de forma
    mais atual e revogável por endpoint autorizado.
12. Nenhuma aplicação escolhe tenant, empresa, papel ou escopo fora das
    decisões emitidas ou consultáveis pelo Auth.
13. Em banco migrado, uma lista vazia de destinos significa nenhum destino
    autorizado. Excluir ou desativar o último redirect nunca reativa o campo
    textual legado, tanto no login quanto no retorno após logout.
14. Criar ou editar um cliente e substituir seus destinos é uma única transação.
    Falha na gravação dos destinos desfaz a alteração do cliente. Escritas exigem
    o esquema migrado; a compatibilidade legada é somente de leitura.
15. Criar ou editar uma aplicação e persistir sua política central é uma única
    transação. Falha na política desfaz a gravação do catálogo, inclusive quando
    faltam tabela ou coluna. Não é permitido informar sucesso descartando
    regras de MFA, cadastro, recuperação, convite ou empresa. A compatibilidade
    de leitura durante a migração não autoriza escrita parcial.

A auditoria administrativa ocorre depois da gravação conjunta nas ações do
painel. A transação de catálogo/política não inclui essa auditoria nem vínculos
mantidos em outro banco; sua atomicidade não deve ser presumida.

## Fluxo OIDC obrigatório

```text
Consumidor
  -> /oauth/authorize
Auth
  -> autentica conta, MFA e autorização
Auth
  -> redirect_uri exata com código de uso único
Consumidor
  -> /oauth/token com client authentication e PKCE quando aplicável
Auth
  -> access token e id token conforme scopes concedidos
Consumidor
  -> /oauth/userinfo ou endpoint de contexto quando necessário
```

O `id_token` representa identidade e autenticação. Autorização corporativa,
papéis, unidades e alçadas devem continuar consultáveis e revogáveis pelo
contrato próprio, sem transformar o token em banco de dados congelado.

O endpoint de token revalida a conta ativa, a aplicação habilitada e a permissão
atual tanto na troca de código quanto na renovação. Remover a aplicação ou
desativá-la impede novas emissões; uma família de refresh recusada por esse
controle é revogada. Identidade e escopos emitidos refletem a conta atual,
inclusive quando o papel muda depois da autorização inicial.

## Logout

O logout central deve:

- invalidar a sessão do Auth;
- revogar sessões e tokens revogáveis relacionados;
- invalidar desafios e códigos pendentes quando aplicável;
- notificar clientes com `logout_uri` configurado;
- enviar token assinado, com audiência do cliente e identificador da sessão;
- tratar falha do consumidor como resultado auditado, não como motivo para
  restaurar ou manter a sessão central.

### Confirmação de logout e validação prévia

`GET /api/auth/logout` nunca invalida sessão nem revoga tokens. Ele abre
`/sair`, onde a pessoa pode confirmar a saída ou manter sua sessão. POST vindo
de consumidor, origem ausente ou origem opaca também passa pela confirmação.
O POST que executa a saída exige `Origin` exatamente igual à origem pública
configurada em `SSO_BASE_URL`; em produção o portal `https://conta.avilaops.com`
também é parte do próprio serviço. Outros subdomínios não recebem essa confiança.

Parâmetros aceitos: `client_id`, `post_logout_redirect_uri`, `state` e, durante
a migração, `app`/`returnTo`. POST também aceita formulário URL-encoded, com
limite de 8 KiB. Valores conhecidos têm limite de 2048 caracteres; repetições,
inclusive entre URL e corpo, são recusadas. `id_token_hint` ainda não é aceito:
se presente, retorna `400 invalid_request`, sem usar ou propagar o token.

Antes de qualquer efeito, o servidor revalida cliente ativo e retorno OIDC
exato, mesmo depois de a confirmação ter sido exibida. `state` só é devolvido
nesse destino validado. Destino/cliente inválido retorna `400 invalid_request`
sem apagar cookie, revogar refresh ou agendar avisos. Falha operacional não é
convertida em um logout bem-sucedido. A repetição sem sessão não repete
revogação, auditoria nem agendamento de aviso; não há garantia nova de
deduplicação entre requisições concorrentes.

A confirmação usa `Referrer-Policy: same-origin`: `no-referrer` pode tornar
`Origin` opaco no POST de navegador. A proteção global contra iframe permanece
ativa. Não há logout automático por hint nesta versão. Consulte as evidências
e limites em [AVL-420-LOGOUT-CONFIRMACAO.md](AVL-420-LOGOUT-CONFIRMACAO.md).

## Provisionamento

Provisionamento não cria uma identidade paralela. Ele sincroniza no consumidor
uma conta já autorizada pelo Auth.

O consumidor deve:

- aceitar somente chamadas autenticadas pelo cliente autorizado;
- respeitar o escopo e a aplicação vinculada;
- tornar a operação idempotente;
- não alterar permissões de outra aplicação;
- devolver resultado verificável;
- registrar falhas sem expor segredos ou dados pessoais desnecessários.

## Compatibilidade e migração

O formulário de aplicações usa uma única política de acesso. O servidor deriva
dela os campos legados de login, papel exigido e restrição, para que não sejam
gravadas decisões contraditórias. Aplicações novas começam em
`clientes_liberados`; sites precisam selecionar `desativado`. Valores de
política desconhecidos são recusados antes da gravação.

Durante a migração da política, a ausência da relação `politica` (`P2021` ou
`P2022`) exige reler `aplicacoes` sem essa relação, tanto na busca individual
quanto na listagem. O catálogo persistido continua definindo existência,
desativação, acesso restrito, papel e MFA; um resultado vazio não recupera
aplicações da lista de fábrica. Falhas operacionais de banco são propagadas,
inclusive na segunda leitura. A compatibilidade de bootstrap já existente só
é alcançada se a leitura sem relação também falhar por esquema ausente.

Compatibilidades legadas podem permanecer somente durante uma migração
explicitamente registrada. Não serão criados novos consumidores usando:

- cookie SSO compartilhado como contrato principal;
- lista fixa de clientes em código;
- segredo duplicado em variável de ambiente quando o cliente é administrado
  pelo Auth;
- callback não cadastrado no cliente OIDC;
- autorização local que contradiga a decisão do Auth.

Cada consumidor migrado precisa comprovar:

1. login OIDC completo;
2. rejeição de redirect inválido;
3. audience e issuer corretos;
4. MFA quando exigido;
5. ausência de acesso sem permissão;
6. logout local e federado;
7. revogação;
8. provisionamento, quando utilizado;
9. comportamento de erro e indisponibilidade do Auth.

## Versão

Este é o contrato central v1. Mudanças incompatíveis exigem nova versão,
período de migração documentado e matriz de consumidores afetados.
