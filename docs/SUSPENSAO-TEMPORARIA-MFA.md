# Suspensão temporária por conta

O operador pode suspender a exigência de MFA para uma única conta ADMIN por
até 24 horas. A configuração fica no ambiente privado do Auth, sem alterar
`MFA_EQUIPE`, as políticas dos outros usuários ou os registros do autenticador.

Configure `MFA_SUSPENSAO_TEMPORARIA` como JSON de uma única linha:

```json
{"email":"dev@example.test","inicio":"2026-10-30T12:00:00Z","fim":"2026-10-31T12:00:00Z","motivo":"Desenvolvimento acompanhado autorizado"}
```

Use o e-mail exato da conta e instantes UTC. Sem configuração válida, antes do
início e a partir do fim, a política normal volta a valer. A janela não pode
exceder 24 horas; não há renovação automática. Remover a variável encerra a
exceção. A configuração precisa ser carregada pelo processo como as demais
variáveis de ambiente; a expiração é conferida em cada decisão de MFA.

A exceção vale para login, elevação de sessão e autorização OIDC, que usam a
mesma decisão central. Ela dispensa somente o segundo fator: senha ou login
social continuam necessários, assim como as permissões do aplicativo. A sessão
continua com `mfa: false`; a exceção não produz uma alegação de MFA realizado.
As verificações liberadas geram o evento `mfa_suspenso_temporariamente` com
conta, aplicativo, motivo e término. O segredo e os códigos de recuperação
permanecem intactos. A desativação definitiva mantém sua própria verificação.

O término não revoga retroativamente sessões ou tokens que já foram emitidos.
Eles conservam a validade normal; ao passar novamente pelo Auth sem prova de
MFA, a conta volta ao desafio. Uma tela de desafio que já estava aberta pode
ser abandonada voltando ao login do aplicativo; não se deve limpar ou forjar
cookies de identidade para usar a exceção.
