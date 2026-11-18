# RustDesk • login pelo Auth

Configuração operacional realizada em 16/11/2026 a pedido do proprietário.

## Configuração

- Aplicação: `suporte`, host `suporte.avilaops.com`, ativa e restrita a administradores e contas liberadas.
- Cliente OIDC: `rustdesk-avilaops`.
- Emissor: `https://auth.avilaops.com`.
- Retorno exato: `https://suporte.avilaops.com/api/oidc/callback`.
- Provedor no RustDesk: `Ávila Ops`, tipo `oidc`, escopos `openid,profile,email`, PKCE S256.
- Segredo aleatório exclusivo; apenas SHA-256 armazenado no Auth. Nenhuma credencial incluída neste documento.
- O conector GitHub existente tinha credenciais cadastradas e estava desligado. Foi reativado por solicitação de reutilização desse login.
- Callback GitHub preservado: `https://auth.avilaops.com/api/auth/github/callback`.
- Provedores e usuários anteriores do RustDesk preservados. Nenhuma alteração no código ou reinicialização de servidor.

## Evidências

- Descoberta OIDC pública HTTP 200.
- Credencial do novo cliente aceita no endpoint de token; código inválido recusado com `invalid_grant`.
- Retorno não cadastrado recusado pelo Auth.
- `/api/login-options` do RustDesk anuncia `Ávila Ops`.
- Navegador: botão `Ávila Ops` do RustDesk abre o login do Auth com cliente, retorno, state, nonce e desafio S256 preservados.
- Login do Auth mostra `Continuar com GitHub` e preserva o retorno OIDC.
- Início do GitHub retorna redirecionamento para `github.com` com o callback GitHub acima.
- Navegador confirmou a tela oficial de login do GitHub após clicar `Continuar com GitHub` no fluxo iniciado pelo RustDesk.
- Serviço Windows RustDesk continua `Running`, inicialização `Auto`.

## Limite de validação

A autenticação pessoal e o retorno final ao cliente RustDesk dependem do usuário. Nenhuma sessão foi criada artificialmente. Contas não administrativas precisam de liberação para a aplicação `suporte`.

## Recuperação

Backup SQLite anterior ao cadastro: `/opt/rustdesk/data/api/rustdeskapi.before-avila-oidc-20261116T202411Z.db`, no host `apps-noclient`, com permissão 0600.

Para desfazer somente esta integração, remover o provedor `Ávila Ops` do RustDesk e o cliente `rustdesk-avilaops` do Auth. A aplicação `suporte` só deve ser removida após conferir dependências. O estado anterior do conector GitHub era desligado. Não restaurar o banco inteiro sobre alterações posteriores.
