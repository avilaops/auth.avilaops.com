# Recuperação de senha pelo próprio usuário

O login central agora oferece **Esqueci minha senha**. A pessoa informa o e-mail da conta, recebe o link, escolhe uma nova senha e continua pelo fluxo normal de acesso. Não precisa pedir um link à equipe.

Entrega revisável: [PR 60](https://github.com/avilaops/auth.avilaops.com/pull/60). A publicação e sua dependência estão registradas abaixo; esta entrega não significa que o domínio de produção já foi atualizado.

- Pedido: `/recuperar` e `POST /api/auth/recuperar/solicitar`.
- Redefinição: `/recuperar/[token]` e `POST /api/auth/recuperar`.
- O link vale por uma hora, guarda somente SHA256 e pode ser usado uma vez.
- Após a troca, os outros links ainda não usados da mesma conta são invalidados.
- Contas inativas e políticas que proíbem recuperação não emitem links.
- Conta e política são conferidas antes de consumir o link.
- A senha anterior deixa de autenticar; MFA e autorização por produto permanecem exigidos.
- Um link usado/vencido oferece pedir outro pelo próprio formulário.

A resposta pública não revela se o endereço possui conta. A consulta de identidade e o envio acontecem após a resposta, usando [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after). Há limite de oito pedidos por IP em quinze minutos e três por hash de endereço em uma hora. Falhas do transporte não devolvem detalhes de conta; os logs não registram endereço ou token nesse caminho. O formulário aceita somente origens do Auth/Conta e as respostas não são armazenadas em cache.

O e-mail utiliza o SMTP ou relay n8n já suportado pelo Auth. Em DEV, continua sendo capturado no disco. A tela de redefinição informa `no-referrer` e não é indexada. Revisão guiada pelas recomendações [OWASP • Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## Verificação

- 428 testes Node aprovados, incluindo pedido, resposta uniforme, limites, origem, retorno seguro, política, conta inativa, uso único e invalidação.
- 76 testes em PostgreSQL descartável aprovados.
- Typecheck e build aprovados; lint sem erros, com um aviso anterior em `Marca.tsx`.
- Seis grupos no navegador, com Next e PostgreSQL reais e mensagens capturadas em disco: pedido de links; redefinição em outro contexto; replay/invalidação; recusa da senha anterior e login com a nova; expiração real; limite e resposta uniforme.

O teste usa uma conta sintética temporária em bancos DEV e remove a conta e seus tokens ao finalizar. Não envia mensagens externas nem redefine contas reais.

```powershell
npm run dev:setup
npm run dev:local
# Em outro terminal, com Playwright disponível conforme os demais testes DEV:
npm run test:browser:recovery
```

Quando Playwright está instalado fora do checkout, `AUTH_DEV_PLAYWRIGHT_MODULE` informa seu módulo. No Windows, encerrar o servidor Next antes de `npm run build` ou `npm run test:local`, pois o Prisma não pode substituir a DLL carregada pelo servidor. O PostgreSQL DEV deve permanecer ativo para os contratos.

## Publicação

Verificação pública em 16/11: `auth.avilaops.com` está no serviço Render `auth-avilaops-emergency`; `conta.avilaops.com` está em `conta-avilaops`. O Auth publicado informa que o envio por e-mail não está disponível. A credencial Render local conhecida acessa somente o serviço Conta. É necessário configurar o transporte no Auth e publicar a versão no serviço que atende o domínio antes de anunciar o recurso como disponível em produção.

A implementação é do login central. Não altera senhas SMTP/IMAP das caixas de e-mail, permissões, papéis ou vínculos corporativos.
