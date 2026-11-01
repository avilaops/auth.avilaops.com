# Conexão Meta entre Conta e Auth

Em 01/11/2026, a conexão iniciada em `conta.avilaops.com/conta/meta`
voltou do Facebook para `auth.avilaops.com/erro?motivo=fluxo_expirado`.
A configuração pública do container define `SSO_BASE_URL=https://auth.avilaops.com`.

O botão usa `/api/meta/conectar`. O roteamento do host Conta permitia todas
as APIs nesse host, inclusive essa rota. Ela gravava o estado temporário em
um cookie HttpOnly restrito ao host Conta, enquanto `redirectUriMeta()`
apontava para o callback no host Auth. O callback não recebia esse cookie.

A correção encaminha somente `/api/meta/conectar` ao Auth antes de iniciar
OAuth. Início e callback passam a compartilhar o host. As verificações de
estado e sessão e o escopo restrito do cookie permanecem ativos. Webhooks,
exclusão de dados e APIs de leitura não mudam de host.

O teste de roteamento cobre o encaminhamento, a preservação da query,
a ausência de loop no Auth e a manutenção das outras APIs no host Conta.
Validação local: 316 testes passaram, incluindo a regressão de roteamento;
`npm run typecheck` passou; `npm run lint` terminou sem erros, com o aviso
preexistente de imagem em `Marca.tsx`. `git diff --check` passou.

A publicação usa o workflow `Build e deploy`, sem build no servidor
`applications`. CI, revisão servida em produção e retorno autenticado ainda
dependem da publicação e da verificação no navegador.
