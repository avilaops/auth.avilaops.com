# auth.avilaops.com — regras para agentes

<!-- avilaops:contexto:inicio (versão 2026-10-03; gerado a partir de avilaops/contexto, não editar aqui) -->
## Contexto Ávila Ops (vale para todos os projetos)

Este repositório pertence à Ávila Ops Tecnologia, que ajuda pequenas empresas a construir presença digital, organizar a operação e crescer. As contas `avilaops` e `avilainc` no GitHub são a mesma empresa. Nicolas Avila (Nicolas sem acento) é o fundador e quem decide.

### Como trabalhar

- Comunicar em português natural, com resposta direta e evidência. Sem tom de coach, promessa vaga ou jargão comercial. O idioma da interface e do conteúdo acompanha o site, não a conversa.
- Identificar o projeto, o domínio, o repositório e o ambiente antes de alterar qualquer coisa. Não presumir que todos os projetos usam o mesmo deploy.
- Ter iniciativa dentro do pedido e levar a tarefa até um resultado verificado. Plano, código, publicação e funcionamento comprovado são coisas diferentes: não declarar sucesso só porque um build terminou ou um workflow foi ativado.
- Proteger dados, acessos e a separação entre clientes. Nunca gravar segredo em arquivo versionado, issue, PR ou memória.
- Não iniciar comunicação externa nem ação irreversível sem autorização do Nicolas.
- Preservar trabalho em andamento de outra pessoa ou de outro agente. Trabalho não commitado vai para uma branch `resgate/*`.

### Decisões vigentes

- Pagamentos: Mercado Pago no Brasil e PayPal para clientes de fora. Não usar Stripe nem Éfi, mesmo que material antigo diga o contrário.
- Automações em n8n, infraestrutura em Cloudflare e canais em Twilio, preservando integrações existentes.
- Ofertas com três planos: entrada limitada, intermediário como escolha principal e premium como referência. Consultar preços vigentes antes de publicar.
- Build de aplicação roda no GitHub Actions, não no servidor de produção.
- Versão antiga de código fica no GitHub. Não criar `.tgz`, `.tar`, `*-before-*` nem pastas `rollback/`, `releases/` ou `backups/` com código no servidor; voltar versão é republicar o commit. Antes de mexer em dado, fazer dump do banco.

### Sessões na nuvem

- Uma sessão de nuvem não tem acesso à máquina do Nicolas, aos servidores nem à memória compartilhada. Não presumir o estado de produção: buscar evidência ou dizer que não foi verificado.
- Decisão durável tomada na sessão deve ficar registrada na descrição do PR e, quando for do projeto, neste arquivo, fora deste bloco.
- A memória compartilhada completa e as regras corporativas ficam no repositório privado `avilaops/contexto`.
<!-- avilaops:contexto:fim -->

Este repositório é o SSO central da Ávila Ops.

## Papel

`auth.avilaops.com` cuida de contas, sessão, permissões, conectores de login e
painel administrativo da equipe. Não é landing page comercial.

Desde 08/10/2026, por decisão do Nicolas, o auth também é o **app central da
Meta**: guarda a autorização do cliente para Páginas, Instagram, WhatsApp,
anúncios e catálogos (`/conta/meta`, tabelas `conexoes_meta` e `ativos_meta`).
O auth guarda e mostra a conexão; enviar mensagem, publicar e anunciar continua
sendo trabalho de cada sistema consumidor.

## Regras

- Preservar separação entre autenticação, autorização e apps consumidores.
- Nunca commitar `.env`, tokens, secrets ou senhas.
- Sessão de equipe e sessão de cliente não devem ser misturadas sem desenho
  explícito.
- Mudança de cookie, issuer, domínio ou segredo invalida login em cadeia e deve
  ser documentada antes de aplicar.
- Caminho novo que cria sessão passa por `src/lib/entrada.ts`. Chamar
  `gravarCookieSessao` direto pula o segundo fator — e o caminho esquecido é
  exatamente por onde se entra sem ele.
- Token da Meta só entra no banco cifrado (`cripto.ts`) e nunca vai para a
  tela nem para log. Pedir à Meta só permissão que já tem tela funcionando.
- Sistema novo que fala com o auth entra por `/admin/integracoes`, não por
  entrada nova em `src/lib/oidc.ts`. Segredo de integração só existe em claro
  na tela em que é gerado.
- `/api/meta/ativos` é a única rota que entrega token da Meta. Quem a chama
  precisa da permissão marcada na integração, e cada leitura vai para `eventos`.
- Código em TypeScript.

## Entrar dentro do auth

`entrar.avilaops.com` pode ser absorvido por este repositório se virar módulo
ou app interno, mas precisa preservar:

- issuer próprio para sessão de cliente;
- cookie separado da sessão administrativa;
- papel `CLIENTE` sempre;
- lista explícita de apps que aceitam esse login;
- redirect URI documentada.
