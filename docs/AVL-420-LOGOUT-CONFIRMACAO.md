# AVL-420 — Confirmação e validação do logout central

## Resultado e limites

O logout deixa de executar efeitos em GET ou POST de outro site. Esses pedidos
abrem uma confirmação no Auth. POST do próprio Auth/Conta valida o destino
antes de apagar cookie, revogar refresh, registrar auditoria e agendar o aviso
back-channel existente.

Issue: [AVL-420](https://linear.app/avilaops/issue/AVL-420).
Base: `2a4989d58fac03a38db4d8f6cc595add69ba3582`, confirmada em 03/11/2026.
Repositório confirmado pelos recursos do projeto e issue Linear:
`avilaops/auth.avilaops.com`.

Não altera assinatura/entrega do aviso, persistência, migrations, permissões,
consumidores nem workflows. Não certifica revogação de todos os tipos de token,
deduplicação concorrente ou logout operacional de todos os consumidores.

## Diagnóstico reproduzido

A rota anterior chamava o mesmo handler em GET e POST. Cookie, refresh e
auditoria eram alterados antes de consultar cliente e destino. O cookie central
é `SameSite=Lax`, portanto navegação externa de topo pode carregar a sessão.
Os testes novos observaram os efeitos indevidos, incluindo a limpeza do cookie
antes de uma falha de banco na resolução do destino.

Primeira regressão, ainda contra a rota antiga: 15 cenários, 3 aprovados e
12 falhas esperadas. Após a correção passaram os 15. Cobertura adicional inclui
revogação de destino entre navegação e confirmação, retorno legado seguro,
origens por ambiente e renderização da confirmação.

## Contrato HTTP

| Entrada | Resultado |
| --- | --- |
| GET `/api/auth/logout` | `303` para `/sair`, sem mutação da sessão. |
| POST de origem externa, ausente ou `null` | `303` para confirmação, preservando os parâmetros reconhecidos, sem mutação. |
| POST com origem exatamente igual a `SSO_BASE_URL` | Revalida destino; se válido, encerra sessão e responde `303`. |
| POST de `https://conta.avilaops.com`, quando Auth usa sua origem pública de produção | Mesmo tratamento do próprio serviço. |
| Destino OIDC não registrado, cliente ausente/desativado ou aplicação legada desconhecida | `400 invalid_request`, antes de qualquer efeito. |
| Parâmetro repetido, valor maior que 2048 caracteres, hint não suportado ou corpo maior que 8192 bytes | `400 invalid_request`, antes de qualquer efeito. |
| Falha operacional de persistência na validação do destino | Erro propagado, sem limpar cookie nem anunciar sucesso. |

Aceita `client_id`, `post_logout_redirect_uri`, `state`, `app` e `returnTo`.
POST suporta query ou corpo `application/x-www-form-urlencoded`; repetições
entre as duas fontes também são recusadas. O corpo é lido com limite mesmo sem
`Content-Length`. Campos desconhecidos não chegam à confirmação ou ao retorno.

`state` é transportado como valor opaco e só anexado após validar o destino
OIDC exato no cadastro. A confirmação não congela essa autorização: o POST
consulta novamente os destinos ativos. O retorno legado usa `returnToSeguro`.

`id_token_hint` é explicitamente recusado, sem reflexão ou tentativa de aceitar
token não validado. Não há saída automática por hint neste incremento. Pedidos
dos consumidores observados não usam esse parâmetro.

As respostas da API usam `Cache-Control: no-store` e `Referrer-Policy:
no-referrer`. A página dinâmica de confirmação usa `same-origin`: um teste real
no Chrome mostrou que `no-referrer` tornava a origem do formulário `null` e
retornava à confirmação. `same-origin` preserva a verificação local e não envia
o endereço para outro site. Proteção global de iframe já existia em
`next.config.ts` e foi preservada.

Referências primárias: [OIDC RP-Initiated Logout, seções 2 e 6](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
e [Fetch Standard — Origin](https://fetch.spec.whatwg.org/#origin-header).
Não representa implementação integral da especificação: o hint continua fora
das capacidades aceitas, e a entrega assíncrona existente não foi reformulada.

## Compatibilidade e coordenação

Antes da edição foram conferidos os comentários da AVL-420/421/422/423/424,
subtarefas, recursos do projeto, branches, estado dos checkouts e PRs recentes.
Não há issue-mãe da AVL-420. Reservas registradas no Linear:

- PR #48: leitura do cadastro durante migração de política, preservado.
- AVL-421/PR #49: integridade de ambiente, migration/preflight/CI, preservados.
- Esta rodada: rota/helper/confirmação/testes e documentação de logout.
- ERP/Mail/CRM seguem nas AVL-422/423/424; nenhum arquivo deles foi editado.

Os fluxos RP-initiated relatados no Linear para ERP, Mail e CRM usam
`client_id`/`post_logout_redirect_uri`; continuam chegando ao mesmo endpoint,
agora com confirmação. O TMS local usa POST por formulário com `app`/`returnTo`:
esse caminho também chega à confirmação, em vez de receber confiança por ser
outro subdomínio. O aceite integral desses consumidores segue nas suas tarefas.

Não houve implementação paralela por outro agente nesta rodada. Um revisor
independente recebeu escopo somente leitura do patch, sem edição de arquivos.
O revisor não identificou achados bloqueantes nem defeitos concretos e
reexecutou os 21 testes específicos, todos aprovados. O CI fica registrado no
PR e na issue.

## Evidências locais

Ambiente: Node `v24.21.0`, dependências e Prisma Client do mesmo lockfile da
base. `npm ci` no novo worktree falhou com `ENOSPC`; os 298 MiB incompletos
criados por essa tentativa foram removidos. O lockfile foi comparado por
SHA-256 e a instalação completa anterior foi reutilizada por hard links,
sem instalar ou atualizar versões.

```bash
node --experimental-strip-types --disable-warning=ExperimentalWarning \
  --import ./tests/register.mjs --test \
  tests/logoutCentral.test.ts tests/confirmacaoLogout.test.ts
npm run typecheck
npm run lint
npm test
git diff --check
```

A suíte final, incluindo origem por ambiente, passou 361/361 testes
(340 da base e 21 novos); typecheck aprovado; lint sem erros e um aviso
preexistente em `Marca.tsx`; `git diff --check` aprovado. Suítes condicionais de PostgreSQL não foram
habilitadas localmente. Os testes de rota substituem a persistência e efeitos
externos; executam parsing, consulta/resolução de cliente/destino e handler reais.

Build pesado delegado ao CI devido ao espaço local limitado. Nenhum resultado
de build ou CI deve ser inferido dos testes locais; consultar a execução do PR.

## Navegador local e capturas

Chrome/Playwright sobre Next dev em `127.0.0.1:3024`, com conta e cookie
inteiramente sintéticos, sem credenciais externas ou banco real:

1. GET do logout responde `303` sem `Set-Cookie`; navegação chega à confirmação
   e mantém o cookie da conta sintética.
2. A tela mostra identidade e alcance da saída. Cancelar mantém o cookie.
3. Formulário servido em outra origem local (`127.0.0.1:4024`, resposta de
   teste interceptada) envia POST e chega à confirmação sem apagar o cookie.
4. Sem sessão, clicar em Continuar faz POST real com a origem local e recebe
   `303 /login`. Apenas a página final `/login` foi interceptada para não
   consultar banco. Nenhuma sessão autenticada foi encerrada em banco real.
5. Capturas em 390×844 e 1440×900, claro/escuro, sem rolagem horizontal.

O primeiro preview com Webpack falhou no empacotamento de `crypto` da
instrumentação. Turbopack recusou o link simbólico externo de dependências;
reutilização por hard links permitiu o preview padrão, sem mudar configurações
de build. O dev server emitiu avisos de recurso interno para a origem IP;
o fluxo HTML/formulário foi conferido. O processo foi encerrado após os testes.

Capturas sem dados reais:

- [Mobile claro](evidencias/avl-420-logout/auth-logout-390-light.png)
- [Mobile escuro](evidencias/avl-420-logout/auth-logout-390-dark.png)
- [Desktop claro](evidencias/avl-420-logout/auth-logout-1440-light.png)
- [Desktop escuro](evidencias/avl-420-logout/auth-logout-1440-dark.png)

## Classificação do objetivo maior e pendências

| Requisito da AVL-420 | Estado desta rodada |
| --- | --- |
| Separação de entidades e migrations preservando dados | Parcial; sem novas alterações de modelo. Integridade de ambiente está no PR #49. |
| OIDC, PKCE, scopes, discovery, JWKS e troca de código | Parcial; preservados, sem novo aceite ponta a ponta. |
| Redirect e pós-logout por cliente/ambiente | Revalidação de pós-logout comprovada em testes locais; cadastro/ambiente ficam nos incrementos existentes. |
| Logout local e back-channel | Confirmação e validação prévia implementadas/testadas; entrega, revogação ampla e deduplicação concorrente permanecem parciais. |
| Autorização por aplicação, empresa, usuário e papel | Parcial; sem mudanças nesta rodada. |
| Provisionamento idempotente, versionado e auditado | Parcial; convite/recuperação e vínculo de empresa continuam pendentes. |
| HTTP/OpenAPI e documentação | Contrato HTTP de logout documentado; OpenAPI do núcleo permanece pendente. |
| Matriz e migração de todos os consumidores | Parcial; compatibilidade de entradas observadas coberta, aceite externo depende das tarefas dos consumidores. |
| Testes e builds de todos os consumidores | Dependência externa a este patch; não executados nem certificados aqui. |

A AVL-420 deve permanecer **In Progress**. O PR deste incremento deve ficar
**draft**, porque PR pronto dispara merge/deploy automáticos no repositório.
Sem autorização de publicação, não promover, integrar ou publicar.

Pendências do núcleo: hints validados; idempotência concorrente/entrega do
logout; reconciliação de convite e política de recuperação; vínculo de empresa
no provisionamento; default de política e drift corporativo descritos nas
rodadas anteriores; OpenAPI e aceite dos consumidores. Não foram tratados por
remoção de compatibilidades ou alteração de dados presumida.
