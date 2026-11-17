# Auth • dependências Prisma no runtime

A imagem publicada copiava o diretório do CLI Prisma e `@prisma`, mas não todo o grafo transitivo necessário ao entrypoint. O teste `require.resolve('prisma/build/index.js')` confirmava apenas a existência do arquivo principal.

Uma execução isolada da imagem que havia falhado no deploy reproduziu `Cannot find module 'effect'` ao executar `node node_modules/prisma/build/index.js --version`, sem rede, dados de produção ou alteração de serviço. A publicação da saída direta também falhou e restaurou a imagem anterior.

O Prisma passa a ser dependência de produção. Um estágio `npm ci --omit=dev` fornece o grafo completo ao runtime, preservando a versão travada e o cliente gerado para Linux. A construção da imagem agora executa o CLI de fato com `--version`, impedindo aprovar novamente uma imagem com esse defeito.

As alterações de runtime já existentes no checkout principal foram preservadas. Esta entrega usa uma cópia isolada das mudanças necessárias; entradas incidentais de ferramentas de desenvolvimento no lockfile não foram incorporadas.

A correção de empacotamento não altera credenciais, retornos OIDC, migrações ou regras do logout. A ativação é conferida após o CI e o deploy.
