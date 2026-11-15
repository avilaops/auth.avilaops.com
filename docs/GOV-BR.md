# gov.br • identidade centralizada

O conector gov.br pertence ao Auth. O EngOps recebe a sessão Ávila Ops existente; não recebe os tokens gov.br. Consultas públicas PNCP e Compras.gov.br não precisam de login gov.br, e esse login não autoriza automaticamente serviços restritos do Conecta.

## Configuração

Administrar em `/admin/conectores/govbr`. Callback cadastrado no provedor: `https://auth.avilaops.com/api/auth/govbr/callback`. Informar Client ID e Client Secret emitidos pelo órgão responsável e ambiente `staging` ou `producao`; ligar somente com credenciamento válido. Nenhum segredo é versionado. O estado desligado/incompleto não bloqueia o login normal do Auth.

Em 15/11/2026, uma consulta somente de leitura ao banco `avilaops-auth` de produção não encontrou registro `govbr` em `conectores`. A entrada do catálogo existe no código; isso não comprova credenciamento ou credenciais disponíveis. O usuário foi informado e foi solicitada apenas a localização das credenciais, sem segredos no chat.

## Fluxo

Autorização com state, nonce e PKCE S256. Troca de código usa autenticação Basic e code_verifier. Authorize, token, userinfo e JWK permanecem no mesmo ambiente. Tokens RS256 são conferidos com JWK oficial, emissor, expiração, audiência do ID token, nonce e sujeito; o perfil deve corresponder ao sujeito validado. O Auth segue usando suas permissões e segundo fator existentes.

Fonte oficial consultada: https://acesso.gov.br/roteiro-tecnico/iniciarintegracao.html

Validação local: `node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./tests/register.mjs --test tests/govbr.test.ts`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

Login real com autorização do cidadão permanece dependente das credenciais de integração e do consentimento no provedor. Não apresentar testes com chaves sintéticas como uma autenticação real no gov.br.
