# Contrato corporativo v1 e provisionamento v2

O Auth é a fonte de identidade e autorização corporativa compartilhada. Cada
produto mantém seus dados comerciais e envia somente identificadores estáveis,
nomes, papéis e alçadas.

## Sequência de integração

1. O produto garante a conta em `POST /api/provisionamento/acessos`.
2. O produto provisiona organização, unidades e autorizações em
   `POST /api/provisionamento/corporativo`.
3. No OIDC, solicita o escopo `corporate_context`.
4. No servidor, consulta `GET /api/corporativo/contextos` com o access token.
5. A interface exige a escolha explícita de organização e unidade quando houver
   mais de uma opção. O servidor confere o contexto antes de cada operação
   protegida.

O access token não contém organizações, unidades, papéis corporativos nem
alçadas. Assim, suspensão, revogação ou troca de papel vale na consulta seguinte,
sem esperar o token vencer.

## Provisionar

Autenticação: `Authorization: Basic base64(client_id:client_secret)`.

```http
POST /api/provisionamento/corporativo
Content-Type: application/json

{
  "versao": "avila.corporativo.v2",
  "intencaoVersao": 7,
  "organizacaoVersao": 11,
  "email": "comprador@industria.example",
  "organizacao": {
    "referencia": "tenant-123",
    "nome": "Indústria Aurora"
  },
  "unidades": [
    { "referencia": "matriz", "nome": "Matriz" },
    { "referencia": "filial-sp", "nome": "Filial SP" }
  ],
  "autorizacoes": [
    {
      "papel": "COMPRADOR",
      "referenciaUnidade": "matriz",
      "limiteAprovacaoCentavos": null
    },
    {
      "papel": "APROVADOR",
      "referenciaUnidade": "filial-sp",
      "limiteAprovacaoCentavos": 150000
    }
  ],
  "convidadoPor": "dono@industria.example"
}
```

Papéis aceitos: `ADMINISTRADOR`, `COMPRADOR`, `APROVADOR`, `FINANCEIRO` e
`VENDEDOR`. `referenciaUnidade: null` concede o papel em toda a organização.
`limiteAprovacaoCentavos: null` significa sem alçada monetária configurada.

O provisionamento é idempotente para `client_id + organizacao.referencia +
conta`. Uma alteração substitui o conjunto de autorizações e incrementa a
versão da organização.

Resposta de sucesso:

```json
{
  "contrato": "avila.corporativo.v2",
  "organizacaoId": "uuid",
  "vinculoId": "uuid",
  "versao": 2,
  "intencaoVersaoAplicada": 7,
  "organizacaoVersaoAplicada": 11
}
```

`organizacaoId` identifica a organização do Auth, `vinculoId` identifica o
vínculo da conta, `versao` é a versão corporativa e
`intencaoVersaoAplicada` confirma a intenção efetivamente aplicada. O produto
deve incrementar `intencaoVersao` a cada mudança material do comprador e
`organizacaoVersao` a cada mudança da empresa ou das unidades. O Auth ignora
requisições atrasadas em cada fluxo e suspende unidades omitidas do snapshot
mais novo.

Durante a migração, o POST v1 sem os novos campos e o DELETE sem `contrato`
continuam aceitos enquanto a organização e o vínculo ainda não receberam uma
intenção v2. Depois disso, chamadas v1 são tratadas como retries antigos e não
sobrescrevem o estado v2. Isso permite publicar o Auth antes dos produtos.

## Consultar contextos

```http
GET /api/corporativo/contextos
Authorization: Bearer ACCESS_TOKEN_COM_CORPORATE_CONTEXT
```

```json
{
  "contrato": "avila.corporativo.v1",
  "contextos": [
    {
      "contrato": "avila.corporativo.v1",
      "organizacaoId": "uuid",
      "vinculoId": "uuid",
      "referenciaExterna": "tenant-123",
      "nome": "Indústria Aurora",
      "versao": 2,
      "autorizacoesOrganizacao": [],
      "unidades": [
        {
          "id": "uuid",
          "referenciaExterna": "matriz",
          "nome": "Matriz",
          "autorizacoes": [
            { "papel": "COMPRADOR", "limiteAprovacaoCentavos": null }
          ]
        }
      ]
    }
  ]
}
```

A consulta retorna somente organizações pertencentes ao `client_id` que recebeu
o token. Uma integração desativada deixa de consultar contextos imediatamente.

## Suspender ou revogar

```http
DELETE /api/provisionamento/corporativo?email=comprador%40industria.example&organizacao=tenant-123&situacao=SUSPENSO&contrato=avila.corporativo.v2&intencaoVersao=8
Authorization: Basic base64(client_id:client_secret)
```

`situacao` aceita `SUSPENSO` ou `REVOGADO`. A resposta contém
`intencaoVersaoAplicada`; o mesmo controle monotônico do provisionamento vale
para suspensão e revogação. As duas removem o vínculo das
consultas imediatamente; a revogação também registra a data definitiva. Todas
as mudanças ficam na auditoria do Auth.
