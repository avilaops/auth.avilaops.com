# Retorno após cadastro e recuperação — AVL-384

## Comportamento

A emissão do e-mail agora normaliza a origem no servidor para ambos os caminhos:
conta nova (token assinado) e conta existente (link de recuperação de uso único).
Aplicação explícita preserva um destino HTTPS do host cadastrado, desde que seja
uma página de navegação válida. Origem OIDC só é reconhecida com cliente ativo,
redirect URI exatamente cadastrado e aplicação habilitada.

No fluxo por e-mail, OIDC volta ao início do produto, que inicia uma autenticação
nova. Não se reaproveitam `state`, `nonce` ou desafio PKCE de outra aba/navegador.
Isso preserva o produto de origem, mas não uma página interna que existia apenas
no cookie de autenticação do navegador anterior. Destinos explícitos válidos
continuam preservando caminho e consulta.

Destinos desconhecidos não viram redirecionamento externo: aplicação conhecida
usa sua raiz; origem desconhecida usa o portal. A confirmação revalida a origem,
inclusive para tokens emitidos antes desta alteração. Convites administrativos
existentes mantêm seu contrato; suas rotas de emissão não foram modificadas.

O consumo da recuperação continua revalidando permissão e exigindo MFA através
de `entrar`. Expiração e consumo atômico do link permanecem na implementação
existente. A resposta pública do pedido de cadastro continua igual para contas
novas e existentes.

## Interface

- Confirmação de conta já existente oferece login com origem preservada.
- Corrida entre confirmação e criação por outro fluxo responde 409 com o mesmo
  caminho de login, exibido pelo formulário.
- Recuperação vencida/usada oferece uma ação para voltar à entrada.
- O formulário não anuncia 24 horas para todos os links: recuperação usa 1 hora.

## Verificação local em 31/10/2026

315 testes aprovados; typecheck aprovado; lint sem erros, com aviso preexistente
em `Marca.tsx`. Os sete cenários novos executam as rotas reais com adaptadores
de armazenamento e entrega isolados. Incluem cadastro novo/existente, origem
explícita e OIDC, token expirado/reutilizado, URL externa/malformada, permissão
revogada e exigência de MFA.

Não houve envio real de e-mail nem alteração de contas de produção. CI, publicação
e validação com uma conta autenticada precisam de evidência própria.
