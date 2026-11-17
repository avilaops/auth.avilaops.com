# ERP • saída direta para o site

O responsável solicitou que a saída do ERP encerre a sessão e retorne a `https://avilaops.com/`, sem a tela informativa do Auth.

## Contrato entre os serviços

O ERP inicia com POST de mesma origem, apaga seus cookies e grava um marcador cifrado de dois minutos. A continuação consome a fase inicial e envia um formulário POST automático ao Auth, com nonce e CSP restrita. A política de referência preserva o Origin desse formulário. O callback do ERP consome a fase final e redireciona ao site fixo.

O Auth admite esse POST sem confirmação apenas quando todos estes valores correspondem: issuer de produção, origem `https://erp.avilaops.com`, cliente `erp-next` e retorno `https://erp.avilaops.com/api/auth/logout/central/callback`. A validação existente confere novamente cliente ativo e retorno cadastrado antes de apagar cookie, revogar refresh, auditar e agendar os avisos próprios da saída.

GET e POST de origens externas continuam sem produzir esses efeitos. Os demais consumidores preservam o fluxo existente. Nenhum parâmetro recebido escolhe o site final do ERP.

## Verificação do código

• 21 casos de logout central passaram, incluindo saída direta, GET/origem externa sem efeitos, cliente ou retorno revogado, duplicação e erro operacional.
• Typecheck e lint dos arquivos alterados passaram.
• A validação e publicação são registradas no PR correspondente; estes resultados locais não comprovam ativação em produção.

Antes desta mudança, o callback ausente foi corrigido por configuração no cliente de produção. Auditoria `fcc1a69f-a111-41b7-bca9-dbb404547160`; backup privado em `/root/erp-maintenance/auth-logout-20261117/`. Essa configuração permanece necessária e não substitui a implantação do fluxo direto.
