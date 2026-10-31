# Início da conta — AVL-385

## Problema e mudança

O início de `/conta` ocultava aplicativos abertos aos clientes, apesar de a regra
do login permitir o acesso. O usuário podia recuperar sua conta e encontrar
“Nada por aqui ainda” sem conseguir seguir ao ERP.

A página agora usa `menuDeApps`, a mesma política do menu do ecossistema. Ela
mostra aplicações autorizadas e no ar; aplicativos restritos sem permissão,
exclusivos da equipe, planejados, desativados ou fora do ar ficam de fora.
O webmail mantém seu cartão específico.

Os cartões abrem o endereço cadastrado do produto. O antigo caminho relativo
`/login?app=...` era tratado pelo host da conta como login da própria conta,
descartando o produto solicitado. A entrada pelo produto permite que o ERP
inicie seu próprio fluxo OIDC e preserve suas verificações.

## Interface

- Estados próprios para carregamento, falha de consulta e ausência de sistemas.
- A falha oferece nova tentativa na mesma URL, preservando seus parâmetros.
- O estado vazio orienta a conferir dados e usar um convite recebido, sem
  inventar pedidos de acesso ou convites pendentes.
- Cartões em uma coluna no celular e duas a partir de `sm`.
- Nomes e endereços podem quebrar linha; ações com altura mínima de 44 px.
- Texto distingue identidade do usuário e permissão nos dados de uma empresa.

## Verificação em 31/10/2026

- `npm run typecheck`: aprovado.
- `npm run lint`: sem erros; aviso preexistente de `img` em `Marca.tsx`.
- `npm test`: 308 testes aprovados, incluindo renderização dos componentes reais.
- `git diff --check`: aprovado.

Os testes usam dados controlados, sem sessão ou banco de produção. Não comprovam
o comportamento de um usuário autenticado nem uma avaliação visual em navegador.
Essa avaliação, o CI e a publicação devem ser registrados antes de concluir a
entrega. O fluxo completo de origem, confirmação e recuperação continua em
AVL-384; a validação integrada permanece em AVL-397.

## Contratos preservados

Nenhuma permissão, vínculo de empresa, sessão, MFA, banco ou migração foi alterado.
A lista de sistemas não afirma que o usuário já pertence a uma empresa.
