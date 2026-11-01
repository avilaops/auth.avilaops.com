# Validação local da persistência de e-mail

Branch: `feat/security-verification-methods`.
Base: `7293c42c61cd38c97d7975157cfc9d891f4d24ed`, com alterações locais.

## Resultados

- Suíte padrão `npm test`: 297 testes aprovados.
- PostgreSQL: 19 testes aprovados, sendo 7 de estados de e-mail,
  7 de paginação de contas e 5 de empresas; nenhum ignorado nessa execução.
- Identidade corporativa em PostgreSQL: 9 testes aprovados.
- Aplicação local com navegador: 14 cenários aprovados, incluindo login,
  cadastro TOTP, recusa de replay, códigos de recuperação e estado de e-mail
  lido do banco após recarga.
- A migração foi aplicada apenas em PostgreSQL local isolado; nenhum banco de
  produção foi acessado ou modificado por esta etapa.

Execução visual: `9a872c07-7b2b-401a-8b97-17bc5500e10f`, com relatório no
checkout do laboratório em
`reports/auth-flow/9a872c07-7b2b-401a-8b97-17bc5500e10f/verification.json`.
SHA-256 do relatório:
`ed34ccef7800b8cf5c55b45d8125d30adfb8b4e5c344951868ffcd46460b9f4e`.

Capturas no mesmo diretório:

- `security-active-desktop.png`: conta sintética com e-mail marcado no banco.
- `security-active-mobile.png`: mesma conta, largura de 390 px.
- `security-available-desktop.png`: conta sintética sem confirmação de e-mail.

O teste alterna `email_verificado` diretamente no banco sintético e confere
"Confirmado"/"Não confirmado" após recarregar. Isso comprova leitura do estado,
não envio nem recebimento de mensagem ou consumo de link. Os controles de
envio/MFA por e-mail e SMS permanecem desabilitados.

O servidor Next, o navegador e o PostgreSQL de teste foram encerrados.
O arquivo gerado `next-env.d.ts` foi restaurado. O inventário de arquivos e
as alterações visuais anteriores foram preservados.

O primeiro teste local foi corrigido para manter a conexão da tabela temporária
durante recusas SQL esperadas e usar o banco isolado exigido pela suíte de
empresas. Os resultados acima correspondem à execução posterior aprovada.

## Publicação e continuidade

Não houve commit, push, migração de produção ou implantação. A ordem de
publicação e as funcionalidades ainda pendentes estão em `ESTADOS-EMAIL.md`.
