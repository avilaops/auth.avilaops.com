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

Em 16/11/2026, a imagem da main foi implantada em `applications` e o registro Cloudflare de `auth.avilaops.com` foi alterado de CNAME para Render a A `178.105.82.48` • DNS only • TTL 300. O container `auth-avilaops-com-web` está saudável; `/api/saude`, TLS e `/recuperar` responderam HTTP 200 pelo domínio.

O `POST /api/auth/recuperar/solicitar` respondeu com a mensagem genérica esperada usando um endereço reservado e não cadastrado (`migration-check@invalid.example`); esse ensaio não enviou e-mail. O `.env` do Auth em `applications` tem token e URL base do relay n8n, e o código forma o webhook `auth-enviar-email`. Uma entrega real do e-mail de recuperação ainda não foi verificada.

A base nativa consultada durante a mudança contém 30 contas em `cliente_portal.portal_clients`; a base `avilaops-auth` tem 12 clientes OIDC e zero usuários SSO. A equivalência dessas contas com o banco que atendia pelo Render não foi comprovada. O serviço Render foi mantido para rollback; não apagar sua base nem as instâncias antes de reconciliar as contas e validar a entrega de e-mail.

A implementação é do login central. Não altera senhas SMTP/IMAP das caixas de e-mail, permissões, papéis ou vínculos corporativos.
