# Threads no portal Conta

`/conta/threads` apresenta a conexão Threads da empresa vinculada à conta ativa.
A consulta usa o mesmo PostgreSQL do portal (`PORTAL_DATABASE_URL`), já utilizado
pelo Auth para `portal_clients` e empresas. Não cria outra cópia das credenciais.

A consulta une conta ativa, organização não arquivada e conexão `threads_login`.
O ID da conta vem da sessão; nenhum parâmetro do navegador escolhe empresa.
Somente nome, estado, escopos e datas são selecionados. O Auth não lê nem
descriptografa tokens Threads neste fluxo.

OWNER e SOCIO recebem link para gestão no Hub Social. Os demais usuários
consultam sua empresa e são orientados a solicitar alterações à equipe
responsável. Nenhuma conexão é declarada ativa sem validade futura registrada.
As operações no Hub inspecionam novamente o token junto à Meta.

A conexão OAuth e as publicações são executadas pelo Hub. Esta entrega não
altera cookies, sessões OIDC ou o endpoint legado de ativos Meta.

Verificação: `tests/threads.test.ts`, typecheck e lint. Acesso a uma conta real
depende de configuração e autorização Threads no Hub; presença da tela não
comprova aprovação da Meta.
