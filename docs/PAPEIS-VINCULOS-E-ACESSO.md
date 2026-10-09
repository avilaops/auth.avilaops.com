# Papel, vínculo com empresa e acesso

Escrito em 09/10/2026, depois de duas confusões entre essas três coisas chegarem
à produção no mesmo dia. Elas têm nomes parecidos e moram em lugares diferentes.

## As três coisas

| | O que responde | Onde mora | Quem altera |
| --- | --- | --- | --- |
| **Papel** | O que a pessoa é na plataforma | `portal_clients.role` (banco `cliente_portal`) | Ficha da conta, campo Papel |
| **Vínculo com empresa** | De qual empresa a conta é | `portal_clients.organization_id` | Ficha da conta, seção Empresa |
| **Autorização** | Em que ela entra e o que enxerga | `permissoes` e o cadastro da aplicação (auth); `core.memberships` (app.avilaops.com) | Ficha da conta e da aplicação (auth); gatilho do banco (app) |

Nenhuma decorre da outra por definição. As ligações que existem estão descritas
abaixo, uma a uma, porque são elas que surpreendem.

## Papel

Quatro papéis, definidos pelo app.avilaops.com (`src/lib/auth.ts` de lá):

| Papel | Quem é | É da casa? |
| --- | --- | --- |
| `OWNER` | A plataforma (Avila Ops) | Sim |
| `SOCIO` | Opera a Avila Ops junto com o dono, menos o caixa | Sim |
| `ADMIN` | O dono do negócio que contrata | **Não. É cliente.** |
| `CLIENT` | A equipe desse dono | Não. É cliente. |

O token do login único carrega outro campo, também chamado papel, com dois
valores: `ADMIN` (equipe Avila Ops) e `CLIENTE`. **O `ADMIN` da tabela e o
`ADMIN` do token não são a mesma coisa.** A conversão é `papelDaRole`
(`src/lib/contas.ts`): só `OWNER` e `SOCIO` viram equipe.

Até 09/10/2026 a conversão era "tudo que não é `CLIENT` é equipe", e o dono do
negócio saía do login com sessão de equipe. Com ela, a conta de um cliente:

- passava por aplicação marcada "só equipe";
- entrava em aplicação restrita sem liberação;
- no CRM, seria criada como administradora da empresa Avila Ops;
- no TMS, seria tratada como equipe.

Havia quatro contas ativas nesse papel. Nenhuma tinha login registrado em
aplicação só da equipe ou restrita, e nenhuma foi criada no CRM. Corrigido em
avilaops/auth.avilaops.com#3, com testes em `tests/papeis.test.ts`.

O que a sessão de equipe dá, e portanto o que o dono do negócio deixou de ter:
entrada em qualquer aplicação com login único sem liberação, e a exigência do
segundo fator da equipe. O painel `/admin` já era fechado por
`SSO_SUPERADMINS`; sem essa variável, qualquer sessão de equipe o abre.

## Vínculo com empresa

`portal_clients.organization_id` aponta para `operations.organizations`. **Aceita
uma empresa só.**

**Para conta de cliente, gravar esse campo concede acesso.** No banco do
app.avilaops.com, o gatilho `core_portal_identity_mirror` roda a cada mudança de
`organization_id`, `role` ou `ativo` e espelha a conta em `core.memberships`:

| Conta | Participação criada |
| --- | --- |
| `ADMIN` (dono do negócio), ativa | `ADMIN` da empresa, ativa |
| `CLIENT`, ativa | `MEMBER` da empresa, ativa |
| Qualquer das duas, desligada | A mesma, suspensa |
| `OWNER` ou `SOCIO` | Nenhuma |

O app abre os dados de uma empresa para quem tem participação em vigor
(`core.can_access_organization`). Trocar a empresa revoga a participação
anterior; tirar o vínculo revoga a que existia.

Por isso, no painel do auth:

- a associação acontece só na ficha da conta, uma por vez;
- a tela mostra o efeito antes (`lib/vinculoEmpresa.ts`) e as participações em
  vigor;
- a ação recusa gravar sem a confirmação marcada, e o evento da auditoria
  registra se concedeu ou revogou;
- não há associação em lote nem no formulário de nova conta. Uma versão com
  isso chegou a ser escrita e ficou fora (branch `resgate/painel-empresa-em-lote`).

O vínculo de **aplicação** com empresa (`aplicacoes.organizacao_id`) é diferente:
nenhum sistema o lê para decidir acesso. Só organiza o painel.

Filtrar ou agrupar uma listagem por empresa é um recorte da tela. Não muda
sessão, papel nem permissão.

## Autorização no auth

Quem entra em qual aplicação é decidido por `motivoDoAcesso` (`src/lib/apps.ts`):

1. aplicação "só equipe": entra quem tem sessão de equipe, e mais ninguém, nem
   com liberação;
2. sessão de equipe entra em todas as outras;
3. cliente entra em aplicação aberta;
4. cliente entra em aplicação restrita só com liberação explícita (`permissoes`).

O vínculo com empresa não participa dessa decisão.

## Limite: uma empresa por conta

O campo que o painel edita guarda uma empresa. Quem administra duas empresas
(dois CNPJs do mesmo dono, um contador que atende vários clientes, um gerente de
duas unidades) hoje tem duas saídas, as duas ruins:

- uma conta por empresa, com e-mails diferentes, e nenhuma visão conjunta;
- uma conta ligada a uma empresa só, sem acesso às outras.

O modelo do app já comporta mais: `core.memberships` é uma tabela de
participações, com papel por empresa (`ADMIN` ou `MEMBER`), situação e período.
O que falta não é tabela, é decisão. Antes de o painel gravar mais de uma
participação por conta, é preciso definir:

1. qual empresa é o contexto quando a pessoa entra (o campo legado
   `organization_id` hoje faz esse papel);
2. se o papel global (`ADMIN`/`CLIENT`) continua existindo ou se passa a valer
   só o papel de cada participação. Hoje o gatilho deriva o segundo do primeiro,
   então a mesma conta não pode ser administradora numa empresa e membro noutra;
3. como as liberações de aplicação (`permissoes`, que são por conta) se combinam
   com a empresa: liberar o TMS para a conta vale para todas as empresas dela?
4. o que a auditoria grava como empresa de um evento quando a conta tem várias;
5. quem pode conceder: só a casa, ou o administrador de cada empresa.

Enquanto isso não estiver decidido, o painel não cria vínculos múltiplos.

## Busca por CPF

CPF não fica na URL, em cookie nem em log. A busca é enviada numa ação de
servidor, guardada cifrada em `buscas_painel` com validade de 30 minutos, e a
URL leva só um identificador aleatório que vale para a conta que a gravou
(`lib/buscaSigilosa.ts`). Limpar ou trocar a busca apaga a linha.
