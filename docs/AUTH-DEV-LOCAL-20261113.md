# Auth em DEV local — evidências de 13/11/2026

Base: `6975692f569aa107572c65c9c3cda7a9b2beb77b`, branch
`feat/dev-local-linear-20261113`. Escopo autorizado: implementações no
repositório `avilaops/auth.avilaops.com`, trabalhando localmente sem servidor.

## Entregas

- Preparação idempotente de PostgreSQL 18.4 em loopback, com senha própria,
  dois bancos DEV, 30 migrações do Auth e migrações do portal. Contas sintéticas
  cobrem administração, ausência de empresas, duas empresas e vínculo suspenso.
- Transporte de e-mail para disco somente com development/base loopback e
  ativação explícita. Fluxos reais de cadastro e recuperação preservam seus
  tokens, prazos, consumo único, autorização de destino e segundo fator.
- Consumidor OIDC local confere state, nonce, PKCE S256, assinatura RS256,
  audiência e emissor publicado no discovery; consulta empresas no endpoint
  corporativo real. Distingue sua própria sessão da sessão central.
- AVL-386: conta apresenta e-mail confirmado/pendente e vínculos por
  `contaId` autenticado, com sistema, empresa, unidade, papel, suspensão,
  remoção e ausência de permissões. Consulta limitada a 51 linhas para exibir
  50 e sinalizar continuidade; erro de banco não vira estado vazio.
- AVL-388: “Sair da conta” abre `/sair` antes da ação. A tela explica saída
  local, SSO, processamento dos avisos e conexões de acesso contínuo; a
  confirmação mantém POST, validação de origem e destinos cadastrados.
- AVL-421/431: quatro relações MCP ausentes/divergentes no Prisma foram
  alinhadas às FKs existentes na migração. `ON UPDATE NO ACTION` corresponde
  ao SQL já aplicado. Não foi alterada migração antiga, executada conversão
  de dados ou criada migração nova.

## Verificações executadas

Ambiente Windows, Node.js 24.18.0, PostgreSQL 18.4, Prisma 6.19.3.

| Verificação | Resultado |
| --- | --- |
| `npm test` | 406 testes aprovados |
| `npm run test:local`: núcleo, corporativo, vínculos e catálogo | 28 aprovados |
| `npm run test:local`: portal e paginação de 300 mil contas/empresas | 23 aprovados |
| `npm run test:local`: MCP e isolamento entre duas empresas | 6 aprovados |
| Prisma migrate diff | Zero diferenças após alinhar as relações MCP |
| Preflight de aplicações | Aprovado |
| `npm run typecheck` | Aprovado |
| `npm run lint` | Zero erros; um aviso preexistente de `<img>` em Marca.tsx |
| `npm run build` | Aprovado |
| Repetição de `dev:setup` | Contas, hashes de senha, papéis, vínculos, políticas, configuração e credenciais preservados |
| Navegador Chromium local | 15 cenários aprovados; zero pageerrors |

As suítes PostgreSQL usam bancos/schema descartáveis, distintos do uso DEV.
O teste de drift falhou antes do ajuste do Prisma e passou depois, sobre
migrações reais. As novas verificações de ambiente/e-mail/interface/retorno
também foram exercitadas antes e depois da implementação pertinente.

## Navegador

Com login por senha de uma conta local, sem cookie de sessão fabricado:

1. Consumidor → Auth → login → código OIDC/PKCE → assinatura verificada → duas
   empresas autorizadas retornadas pelo backend.
2. Minha conta em 1440, 390 e 320 pixels, cada largura nos temas claro/escuro:
   sem rolagem horizontal, com identidade, sistemas e vínculos legíveis.
3. Saída somente do consumidor elimina sua sessão e preserva o SSO; nova
   entrada OIDC funciona sem reapresentar credencial.
4. Saída central pede confirmação e retorna ao consumidor com state conferido;
   ambos os cookies ficam ausentes e `/api/session` confirma falta de sessão.
5. Conta sem vínculos e conta com vínculo suspenso mostram estados distintos.
6. Cadastro de novo endereço sintético, mensagem recebida no disco, confirmação
   e definição de senha em outro contexto de navegador, retorno ao consumidor
   e autenticação OIDC renovada com segurança.
7. Confirmação reutilizada não cria outra conta.
8. Conta existente recebe recuperação real local; link é consumido em outro
   contexto e conserva a origem do produto. Reutilização é rejeitada.

O total de 15 considera separadamente as seis combinações de largura/tema.
O smoke test reproduzível está em `scripts/check-dev-local.cjs`. Os resultados,
scripts auxiliares e capturas desta execução ficam em `.local/auth/`, ignorado
pelo Git; mensagens, credenciais, cookies e tokens não são anexados à entrega.

## Linear e limites

| Issue | Evidência local deste lote | O que permanece fora deste repositório/ambiente |
| --- | --- | --- |
| AVL-384 | Cadastro/recuperação e origem exercitados com mensagens reais locais | Entrega externa de e-mail e percurso publicado no ERP |
| AVL-386 | Interface e consulta de identidade/vínculos implementadas e verificadas | Seleção/convites mantidos no ERP e verificação publicada com identidade apropriada |
| AVL-388 | Alcance/confirmacão no Auth e saídas exercitadas no consumidor local | Rótulos, cookies e múltiplas abas do ERP real |
| AVL-421 | Migrações, preflight, isolamento e drift verificados | Revisão servida e estado do banco publicado |
| AVL-431 | OAuth/consentimento, autorização cruzada, escrita/exclusão, rotação/revogação e importação testados no PostgreSQL | Corte do gateway, AVX/n8n, migração de conexões reais e publicação do plugin |
| AVL-383/397 | Fluxos locais documentados para apoiar retomada | Checklist completo Auth → ERP publicado, Google/dispositivo físico e consumidores |
| AVL-422/423/424/429 | Escopos identificados no Linear | Implementações pertencem a ERP/Mail/CRM, não a este checkout |

Não há comprovação de publicação nem de isolamento em AVX/n8n neste lote.
Nenhuma conta, banco, política de MFA ou credencial de produção foi alterada.
O GitHub faz merge/deploy automáticos de PR pronto; esta entrega permanece em
PR draft, sem merge. A criação de uma issue DEV no Linear foi recusada pelo
limite gratuito do workspace; os registros existentes recebem a evidência.
