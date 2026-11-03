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

## Logout

O logout central deve:

- invalidar a sessão do Auth;
- revogar sessões e tokens revogáveis relacionados;
- invalidar desafios e códigos pendentes quando aplicável;
- notificar clientes com `logout_uri` configurado;
- enviar token assinado, com audiência do cliente e identificador da sessão;
- tratar falha do consumidor como resultado auditado, não como motivo para
  restaurar ou manter a sessão central.

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
