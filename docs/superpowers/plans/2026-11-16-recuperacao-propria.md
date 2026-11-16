# Recuperação de senha pelo usuário • plano de implementação

**Goal:** Permitir que a pessoa peça seu próprio link de redefinição pelo Auth, sem depender de atendimento.

**Architecture:** Reutilizar os tokens aleatórios de uso único, o envio de e-mail, o formulário de senha e a entrada/MFA existentes. Acrescentar `/recuperar`, o pedido público em `/api/auth/recuperar/solicitar` e links nas telas de login e de link vencido. Revalidar conta/política antes de consumir o token e invalidar os demais links após a troca.

**Tech Stack:** Next.js, React, TypeScript, Prisma/PostgreSQL, testes Node e Playwright.

**Spec:** Pedido do proprietário nesta conversa • o usuário deve conseguir recuperar a própria senha.

## Restrições e aceite

- Link por e-mail, com validade de uma hora; guardar somente hash no banco.
- Resposta pública uniforme para endereço existente, desconhecido, inativo, limitado ou bloqueado pela política; não retornar token no navegador.
- Limites por IP e por hash do endereço; origem do formulário conferida.
- Preservar retorno seguro ao produto e exigência de MFA, sem conceder acesso novo.
- Link vencido/usado oferece pedir outro; usuário não depende do administrador.
- Exercitar envio capturado em disco, token em outro navegador, troca real de senha e login com PostgreSQL DEV. Não testar com contas reais.
- Checkout original `fix/govbr-central` preservado; implementação no worktree isolado `feat/recuperacao-senha-propria`.

## Tarefas

- [x] Testes de pedido, privacidade, limites, origem, política e estado da conta • verificar falha antes da implementação.
- [x] Implementar pedido e template de e-mail; adicionar formulário e links acessíveis.
- [x] Validar condições antes de consumir tokens; invalidar links restantes após sucesso; preservar MFA.
- [x] Executar testes, tipos/lint/build e fluxo completo de navegador com banco e e-mail DEV.
- [ ] Registrar evidências e entregar mudanças revisáveis no GitHub.

## Decisões

O pedido já define o objetivo e o mecanismo existente resolve a arquitetura. A implementação estende o fluxo atual, preservando o cadastro e os convites. Falha na entrega não produz resposta diferente para uma conta existente, evitando enumeração por indisponibilidade do SMTP. A redefinição mantém as políticas de sessão já usadas pelo Auth; não altera papéis ou vínculos.

Atualizado sobre `origin/main` 0c23ebb, preservando a implementação gov.br. Os testes identificaram consumo prematuro por política desabilitada e entrada de conta inativa; ambos reproduzidos em vermelho e corrigidos. Verificação final: 428 testes Node, 76 PostgreSQL, seis grupos de navegador, tipos e build aprovados. Lint tem somente o aviso anterior de `Marca.tsx`.

Publicação separada da implementação: Auth público está no Render sem transporte de e-mail configurado; a credencial local disponível alcança apenas o Conta. Acesso à conta Render do Auth foi solicitado ao proprietário. Não alterar DNS ou bases de produção para contornar essa falta de acesso.

Referência de revisão: [OWASP • Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
