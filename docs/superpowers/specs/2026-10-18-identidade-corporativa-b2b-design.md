# Identidade corporativa B2B

## Intenção

O Auth passa a ser a fonte de autorização corporativa compartilhada pelo
Lojas, CRM, ERP e demais produtos. Cada produto continua dono de seus dados de
negócio; nenhum deles cria uma segunda senha, usuário ou interpretação própria
dos papéis corporativos.

## Modelo

- `OrganizacaoCorporativa` possui identificador estável do Auth, cliente OIDC
  proprietário, referência externa do sistema originador, nome, situação e
  versão.
- `UnidadeCorporativa` pertence a uma organização e representa filial ou
  unidade operacional. A referência externa é única dentro da organização.
- `VinculoCorporativo` liga a conta existente (`portal_clients.id`) à
  organização. Uma conta pode ter vínculos ativos com várias organizações.
- `AutorizacaoCorporativa` concede um papel no escopo da organização inteira
  ou de uma unidade. A alçada de aprovação é opcional, em centavos e BRL.
- Papéis fechados: `ADMINISTRADOR`, `COMPRADOR`, `APROVADOR`, `FINANCEIRO` e
  `VENDEDOR`.
- Situações fechadas: `ATIVO`, `SUSPENSO` e `REVOGADO`.

## Contexto explícito e autorização

O access token continua contendo somente a identidade e a audiência. O
contexto corporativo não é congelado no token: o cliente consulta
`/api/corporativo/contextos` com Bearer token e escolhe uma organização e,
quando necessário, uma unidade entre as devolvidas. A resposta vem do banco no
instante da chamada; suspensão, revogação e troca de papel têm efeito imediato.

O Auth nunca escolhe silenciosamente a primeira organização. O consumidor deve
guardar o contexto escolhido em sua própria sessão e revalidá-lo quando
autorizar uma operação. Uma autorização organizacional vale para todas as
unidades; uma autorização de unidade vale somente para aquela unidade.

## Provisionamento entre sistemas

O cliente OIDC usa credencial Basic em `/api/provisionamento/corporativo`.
Somente o cliente proprietário pode criar ou alterar suas organizações,
unidades e vínculos. O contrato aceita operação idempotente por referências
externas e recusa unidade de outra organização, papel desconhecido, alçada
negativa e conta inexistente.

- `POST`: cria ou atualiza organização, unidade opcional, vínculo e
  autorizações; pode enviar o convite de conta pelo fluxo já existente.
- `DELETE`: suspende ou revoga o vínculo indicado, sem apagar histórico.
- alterações incrementam a versão da organização e registram auditoria com
  ator, organização, vínculo e operação, sem gravar credenciais.

## Convite e desligamento

O provisionamento corporativo reaproveita a conta e o convite do Auth. O
vínculo só fica utilizável quando a conta existe e está ativa. Desligamento não
apaga organização, unidade, vínculo ou autorizações; muda a situação e revoga o
contexto imediatamente.

## Integração

- Lojas grava `authOrganizacaoId`, `authUnidadeId` e `authVinculoId` nos seus
  registros B2B e mantém CNPJ, endereços, centros de custo e limites comerciais
  próprios.
- CRM usa os mesmos identificadores para contas e contatos, sem duplicar pedido
  ou preço.
- ERP usa os identificadores na concessão de crédito, contas a receber e
  conciliação.
- A versão inicial do contrato é `avila.corporativo.v1`.

## Compatibilidade

O campo legado `portal_clients.organization_id` e `core.memberships` continuam
funcionando enquanto os consumidores migram. Eles não são inferidos nem
apagados por este módulo. A migração do Lojas cria referências idempotentes e
associa contas existentes sem duplicar usuário.

## Não objetivos

- Guardar CNPJ, endereço, centro de custo, crédito, pedido ou oportunidade no
  Auth.
- Colocar toda a matriz de organizações e unidades dentro do JWT.
- Migrar automaticamente os vínculos legados sem uma referência externa
  confirmada pelo sistema proprietário.

## Aceite

- Uma conta participa de várias organizações e unidades com papéis diferentes.
- Alçada pode ser organizacional ou específica por unidade.
- Contexto revogado desaparece da consulta imediatamente.
- Cliente OIDC não lê nem altera organização de outro cliente.
- Convite, suspensão, revogação e troca de autorização deixam auditoria.
- Migração, contrato HTTP e integração com Lojas/CRM estão documentados e
  testados.
