# Controle global da verificação em duas etapas

`MFA_HABILITADO=false` desativa a exigência global, sem expiração automática,
para equipe, clientes e aplicativos que possuem `exigeSegundoFator` no cadastro.
A decisão central é compartilhada pelo login, pela elevação de sessão e pela
autorização OAuth/OIDC. A sessão continua com `mfa:false`; nenhum código é
falsamente declarado como verificado. Senha/login social, permissões e
isolamento dos aplicativos continuam obrigatórios.

O controle não remove segredos cifrados, códigos de recuperação nem histórico.
As páginas de conta/administração indicam a desativação. Telas antigas de
desafio voltam ao login. A saúde distingue a desativação deliberada de uma
falha técnica. Não remova `AUTH_ENCRYPTION_KEY` para controlar a exigência.

Sem a variável, com `true` ou com valor desconhecido, a política normal permanece
ativa. Para reativar, remova a variável ou configure `MFA_HABILITADO=true` e
recarregue o serviço pelo processo normal de publicação. A exceção temporária
por conta é independente e não se sobrepõe à desativação global.
