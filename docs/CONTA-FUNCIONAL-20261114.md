# Conta funcional • 14/11/2026

Prioridade confirmada pelo usuário: uso da conta com perfil, segurança,
empresas e conexões. Continuidade em DEV local no repositório
`avilaops/auth.avilaops.com`, branch `feat/dev-local-linear-20261113`,
[PR draft #58](https://github.com/avilaops/auth.avilaops.com/pull/58).

## Comportamento entregue

- Início com quatro atalhos funcionais e sistemas autorizados. Seções com
  títulos próprios e navegação acessível em mobile. • nos textos e metadata.
- Perfil mantém nome, telefone e foto com persistência real. A conta ativa,
  seu endereço e a categoria equipe/cliente do SSO são conferidos no servidor;
  sessão antiga divergente exige nova autenticação.
- Segurança emite confirmação real do endereço atual. Token aleatório de 256
  bits, hash SHA-256 no banco, 30 minutos de validade, consumo único por POST.
  GET não confirma. Reserva transacional de um envio por minuto e três por hora.
  Alterar e voltar ao mesmo e-mail não restaura links antigos. A confirmação
  não cria sessão, não troca senha, não habilita MFA nem muda papéis.
- Empresas em seção própria, com sistema, empresa, unidade, papéis e estados
  reais; 50 vínculos por página, com navegação e estado de página vazia distinto
  de ausência de vínculos. Nenhum acesso inferido por e-mail/CNPJ.
- Conexões em seção própria com nomes, operações, paginação e revogação do
  consentimento e refresh tokens associados na mesma transação, com auditoria.
  A consulta e a revogação ficam limitadas à identidade atual. O endereço
  `/conexoes` redireciona para a área nova.
- Controles sem integração de SMS/MFA por e-mail retirados. Autenticador,
  recuperação e políticas MFA existentes preservados.

## Validação reproduzida

| Verificação | Resultado local |
| --- | --- |
| `npm test` | 414 testes aprovados |
| `npm run test:local` | 76 testes PostgreSQL aprovados • 33 Auth, 37 portal e 6 MCP |
| Drift e preflight | Sem diferença no schema e dados consistentes |
| `npm run typecheck` | Aprovado |
| `npm run lint` | Zero erros • aviso preexistente de `img` em `Marca.tsx` |
| `npm run build` | Aprovado |
| `npm run test:browser:conta` | 39 grupos de cenários aprovados • zero pageerrors |

O navegador realizou login por senha com uma conta sintética, persistiu nome,
telefone e foto, removeu a foto e conferiu a privacidade da leitura. A mensagem
de confirmação foi emitida pelo transporte DEV e consumida em outro contexto;
GET sem efeitos, reuso, token inválido, corpo excessivo, origem externa e
requisição anônima foram verificados. O consumo não criou sessão ou fator MFA.
Revogação própria persistiu conexão e refresh; tentativa cruzada foi recusada.
Bloqueio e mudança da categoria SSO exigiram nova autenticação.

Início, dados, segurança, empresas e conexões foram exercitados em 1440, 390 e
320 px, claro/escuro, sem overflow horizontal. Os seis links de navegação ficam
dentro da viewport e têm alvos de pelo menos 44 px no mobile. A inspeção visual
detectou a navegação móvel cortada; a ordem das regras CSS foi corrigida e o
smoke inteiro repetido. Resultado atual em
`.local/auth/conta-portal/resultados.json`, de `2026-11-14T07:27:08.014Z`, com
capturas no mesmo diretório ignorado pelo Git.

Os testes PostgreSQL usam schemas descartáveis e cobrem concorrência real,
rollback, expiração, reuso, limite de envio, gatilhos de escritores externos,
exclusão, paginação e isolamento. As verificações de identidade, emissão e
conexões foram primeiro executadas com falha e depois aprovadas. A verificação
do estado vazio da segunda página também seguiu esse ciclo.

## Persistência e limites operacionais

`migrations/portal/202611140001_email_confirmation.sql` é aplicada pelo runner
do portal. Acrescenta versão UUID à conta, tabela de desafios e gatilhos de
invalidação/exclusão. A confirmação e o consumo ocorrem na mesma conexão do
portal; não há transação distribuída com o Prisma. Não há nova migração Prisma.

A migração exige ALTER e criação de tabela, função e gatilhos. O default UUID
pode exigir backfill e locks; revisar o volume da tabela compartilhada antes
de publicar. O DDL é idempotente, com limites de espera e transação; falhas
interrompem o startup. Rollback do aplicativo preserva os campos aditivos.

Falha na entrega de e-mail mantém a reserva de envio, evitando tentativas
ilimitadas. O cliente recebe orientação de nova tentativa. SMTP/n8n externos
não foram exercitados; DEV captura a mensagem no disco. Sem transporte, a
interface informa a indisponibilidade. `email_verified` OIDC, confirmação do
cadastro por link e identidades externas não foram alterados nesta rodada.

Nenhum deploy, merge, alteração de produção ou migração de consumidor foi
executado. O PR permanece draft, pois ficar pronto pode disparar automação de
merge/publicação. Google, ERP publicado, convites/seleção de empresa do ERP,
AVX/n8n e migração de conexões publicadas continuam em suas issues. AVL-383 e
AVL-397 não são concluídas por esta evidência local.

## Rastreabilidade

- Spec: `docs/superpowers/specs/2026-11-14-conta-funcional.md`.
- Plano: `docs/superpowers/plans/2026-11-14-conta-funcional.md`.
- Guia: `docs/DEV-LOCAL.md`; estados: `docs/ESTADOS-EMAIL.md`.
- Linear: AVL-383 • portal; AVL-386 • identidade/vínculos; AVL-431 • conexões;
  AVL-397 • limites da evidência integrada.
- CI do commit e vínculos das issues são registrados no PR draft #58.

As consultas Hindsight desta rodada retornaram timeout de conexão. Nenhuma
decisão foi atribuída à memória indisponível; escopo e evidência foram
conferidos no código, nos testes e nas issues existentes.
