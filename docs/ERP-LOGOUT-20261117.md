# ERP • correção do retorno de logout

## Causa verificada

O ERP usa o cliente OIDC `erp-next`, da aplicação `erp`, e solicita retorno para `https://erp.avilaops.com/api/auth/logout/central/callback`. Em produção, o campo `post_logout_redirect_uris` estava vazio e a tabela normalizada `redirect_uris` continha somente o retorno de login. O Auth recusava corretamente o destino não cadastrado.

## Alteração aplicada

O callback exato foi cadastrado no campo textual e como destino normalizado ativo de tipo `post_logout`. A manutenção usou transação serializada, bloqueio do cliente e comparação do estado anterior para evitar sobrescrever uma alteração concorrente. Nenhum wildcard foi adicionado. Retornos de login, credencial e outros clientes foram preservados.

Backup e recibo privados: `/root/erp-maintenance/auth-logout-20261117/`. Evento `integracao_alterada`: `fcc1a69f-a111-41b7-bca9-dbb404547160`, com autor técnico `maintenance:erp-logout-20261117` e autorização do responsável registrada no pedido.

## Verificação

• POST de logout com o callback exato e formato de formulário válido: HTTP 303 para o callback.
• URL externa `https://example.invalid/logout`: HTTP 400, sem redirecionamento.
• Callback com `/extra` acrescentado: HTTP 400, sem redirecionamento.
• Navegador em contexto isolado e sem sessão pessoal: início do logout no ERP, confirmação do Auth e retorno final a `https://erp.avilaops.com/entrar`, sem a mensagem de destino não autorizado.

A conferência não encerrou uma sessão real do usuário nem enviou mensagens. Não houve mudança de código ou reinício do Auth; a correção de configuração já está ativa. A publicação comercial do ERP é independente desta manutenção.
