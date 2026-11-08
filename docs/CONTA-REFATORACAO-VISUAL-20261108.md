# Minha conta: refatoração visual

Base: clone de `avilaops/auth.avilaops.com`, commit `ba78cbb`, branch `refactor/minha-conta`. A cópia anterior de `auth.avilaops.com`, que tinha alterações locais, não foi modificada.

## Implementação

`ContaShell.tsx` organiza marca, identidade, navegação, painel administrativo autorizado e saída. A navegação é lateral no computador e horizontal no celular. Os cards de `SistemasDaConta.tsx` mostram nome, domínio e ação de abertura, com o padrão Mail, CRM, ERP, E-Commerce, CMS e TMS.

O objetivo aplicado das skills CRO e Copy Editing foi reduzir dúvidas sobre onde entrar e como o acesso funciona. Não foram adicionadas ofertas comerciais, dados de uso fictícios ou promessas de resultado.

Após a revisão do usuário, os cards foram reduzidos e reorganizados na horizontal, as siglas decorativas foram substituídas por ícones vetoriais da interface, os textos foram ampliados e a moldura externa da grade foi removida. A busca local filtra apenas os destinos autorizados, por nome ou domínio, ignorando acentos. Ela tem contador de resultados, opção de limpar e mensagem específica quando não encontra correspondências.

Os estilos em `conta.css` usam os tokens existentes, preservam os temas claro e escuro, tratam foco por teclado e respeitam a preferência de movimento reduzido. Os cards ficam mais compactos no celular.

## Contratos preservados

- `lerSessao`, consultas, filtragem por `menuDeApps` e verificação `ehSuperadmin` continuam na página do servidor.
- O componente visual recebe somente os destinos já autorizados. Não concede acesso nem determina permissões.
- Logout continua por POST; ações de dados, provedores, MFA e webmail não foram alteradas.
- A correção recente de feedback de dados salvos foi mantida. A aba Meta continua oculta, conforme a main clonada.
- A grafia da marca foi corrigida no texto alternativo do símbolo existente.

## Validação local

354 testes passaram, incluindo contratos da navegação e saída, autorização existente e escape de nomes. TypeScript e o build Next de produção passaram. Lint terminou sem erros, com o aviso já existente de `<img>` em `Marca.tsx`; o uso do PNG estático está documentado naquele componente.

Na segunda versão foram verificadas doze combinações de tema e largura: claro/escuro em 320, 390, 768, 940, 1280 e 1440 px. Sem rolagem horizontal da página ou erros de navegador. A busca por nome, domínio e texto sem acentos, a limpeza e o estado sem resultados foram exercitados. A navegação por teclado, o link para pular ao conteúdo e o estado de cliente sem sistemas também foram verificados. O script reproduzível é `python scripts/check-conta-preview.py`, com a prévia rodando na porta 3011.

## Prévia visual

```powershell
node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./tests/register.mjs scripts/preview-conta.mjs
python -m http.server 3011 --bind 127.0.0.1 --directory reports/conta-preview
```

Abra `http://localhost:3011/` ou `/vazio.html`. O script renderiza os componentes reais com dados fictícios e inclui o símbolo original. Se houver um build em `.next`, reutiliza os arquivos locais de Manrope baixados por ele. Os arquivos gerados estão no `.gitignore`.

Esta é uma prévia de apresentação com a busca real hidratada por React. O esbuild foi adicionado como ferramenta de desenvolvimento para empacotar essa interação na prévia isolada. Ela não cria sessão, não acessa banco e não envia os formulários reais. A verificação autenticada completa depende da configuração do ambiente de Auth. Nenhuma configuração de produção, migração, commit, push ou publicação foi executada nesta etapa.
