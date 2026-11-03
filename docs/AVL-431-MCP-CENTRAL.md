# AVL-431 — migração controlada do conector MCP

Implementação para revisão em PR draft. Não equivale a deploy ou aprovação de
migração. O plugin continua somente conector, sem aplicações, políticas ou painel.

## Contratos reutilizados

- ClienteOidc, RedirectUri, códigos de uso único, PKCE S256, assinatura OIDC,
  refresh com rotação e detecção de reuso permanecem no núcleo existente.
- Conta, política de aplicação, MFA e contexto corporativo são consultados nos
  serviços existentes. Nenhuma empresa é inferida por e-mail ou papel global.
- Políticas por ferramenta e consentimentos pertencem exclusivamente ao Auth.
  Consentimento restringe operações; não amplia o papel corporativo atual.
- Gateway autentica seu salto ao Auth com o cliente técnico existente. Clientes
  públicos delegados têm audiência própria e só são aceitos pelo gateway pai.
- `/api/mcp/decisoes` valida token, audiência/delegação, família ativa, conta,
  aplicação, consentimento, empresa, unidade, recurso e argumentos da ferramenta.
  Revogar conexão, access token ou refresh invalida a família na próxima chamada.
- `GET /admin/mcp` administra políticas. `GET /conexoes` lista/revoga as
  próprias conexões. Cadastro/rotação de credenciais técnicas segue no painel
  existente de integrações. DCR público fica em `/oauth/register` no Auth.

## Compatibilidade com AVL-420

Inspecionados PRs #48, #49, #50 e #51. Não são reimplementados catálogo,
persistência de políticas, integridade de ambiente ou confirmação de logout.
Durante o trabalho a main avançou até `6694ff3`; os cinco arquivos alterados
do núcleo foram conferidos novamente e não tinham divergência com a base lida.
Alterações são aditivas nos contratos OIDC; não reescrevem os arquivos reservados
de cadastro, política da aplicação ou logout.

O novo registro MCP fica desabilitado sem `MCP_GATEWAY_CLIENT_ID`. Sem essa
variável, login e emissão dos clientes existentes mantêm seu comportamento.
O esquema novo precisa estar aplicado antes de habilitar a variável.

## Preservação das conexões

O importador recebe um snapshot consistente do SQLite e um mapa explícito de
cada família para organização, unidade, operações e recurso. Valida o `sub`
contra a conta real e o vínculo corporativo atual do gateway. Não usa os campos
legados de papel, apps ou e-mail para decidir autorização.

Preserva IDs públicos de cliente, redirects, hashes, famílias, estados de
consumo e vencimentos. Access tokens opacos continuam válidos até seu prazo
original; refresh já emitido passa a ser renovado pelo Auth e recebe tokens
novos com família revogável. Reexecução não atualiza linhas existentes e não
desfaz revogação/consumo. Mapeamento alterado ou família ambígua é recusado.
Clientes sem vínculo inequívoco precisam de novo consentimento; não existe
fallback permissivo. Autorizações em voo precisam terminar antes do corte.

O gateway central mantém proxies de compatibilidade para register/token/revoke
e redireciona authorize ao Auth. Não possui emissão ou revogação local. O SQLite
original permanece intacto para conservação e análise; não deve voltar a ser
autoridade depois da primeira emissão/revogação central.

Comando de preflight, somente leitura, com variáveis de conexão já fornecidas
pelo ambiente e arquivos fora do repositório:

```sh
node --experimental-strip-types --import ./tests/register.mjs \
  scripts/importar-mcp-legado.mjs SNAPSHOT.sqlite MAPA.json GATEWAY_ID
```

Aplicação acrescenta `--apply REFERENCIA_DA_APROVACAO`. Não foi executada contra
qualquer ambiente de cliente. Snapshot e mapa contêm dados sensíveis: acesso
restrito, transporte cifrado, sem anexos no GitHub/Linear e sem impressão.

## Operações propostas para uma futura aprovação explícita

1. Conferir os SHAs revisados de ambos os PRs e o resultado do contrato
   PostgreSQL. Resolver composição com o PR #49 antes de integrar.
2. Validar em homologação, para cada ferramenta liberada, a verificação da
   propriedade de cada objeto pela empresa/unidade. Validar backend stateless.
3. Confirmar inventário de consumidores de serviço: o modo central não aceita
   SERVICO_SHA256 como autorização local. Migrar cada consumidor ao contrato
   central antes do corte; não conceder bypass técnico.
4. Obter backup consistente do banco do Auth e snapshot SQLite com verificação
   de restauração. Preparar mapa explícito das famílias sem registrar conteúdo.
5. Após autorização, integrar/deploy do Auth com o recurso desabilitado e aplicar
   `20261103210000_mcp_decisoes_centrais` pelo `prisma migrate deploy`. Essa
   migração cria tabelas MCP e duas colunas opcionais em códigos/refresh;
   não remove dados, mas pode adquirir locks. Todas as migrações pendentes
   devem ser listadas antes de executar o comando; não aplicar outras por acaso.
6. Impedir novos fluxos no gateway durante a janela acordada; drenar pedidos de
   login por pelo menos 10 minutos e aguardar requisições abertas. Produzir o
   snapshot final consistente, executar o preflight e comparar somente contagens.
7. Importar com `--apply` e referência da aprovação, numa única transação.
   Comparar contagens e validar dois tenants sintéticos e uma conexão migrada.
8. Configurar `MCP_GATEWAY_CLIENT_ID` e `MCP_RESOURCES` no Auth e publicar o
   gateway com `AUTH_MODE=central`, `UPSTREAM_TENANT_CONTEXT=v1`, preservando as
   credenciais técnicas existentes. Não trocar segredos nem apagar volumes.
9. Verificar descoberta, DCR, consentimento/MFA, token/refresh, leitura,
   escrita/exclusão, tentativa cruzada e revogação de token já utilizado.
10. Só depois da evidência, atualizar os endpoints OAuth na configuração do
    plugin mantendo-o exclusivamente conector. Nenhuma publicação pública aqui.

Não executar estes passos sem nova autorização explícita. Antes dela, apresentar
comandos, SHAs, migrações pendentes, contagens do preflight, janela e plano de
recuperação efetivos. Depois do corte, falha exige bloquear o serviço e corrigir
o modo central; restaurar SQLite antigo reativaria tokens revogados e é proibido.

## Limites e evidência

Modo central suporta POST stateless; rejeita sessões MCP compartilhadas e métodos
não cobertos. tools/list filtra o catálogo pelo resultado do Auth. Endpoints
abertos e tokens locais não recebem exceção no modo central. Backend SSE para
tools/list e paginação de catálogo ainda não são suportados.

O indicador `UPSTREAM_TENANT_CONTEXT=v1` é uma trava de configuração, não prova
de isolamento no n8n/AVX. Nenhum objeto de cliente deve ser liberado até o
backend conferir propriedade, inclusive referências em IDs internos. Os testes
HTTP usam destino sintético, portanto não certificam produção nem AVX.

Testes locais: gateway 37/37; Auth 345/345 antes da última suíte PostgreSQL,
typecheck aprovado e lint sem erros (warning existente em Marca.tsx).
Suíte PostgreSQL `mcpBanco.test.ts` adicionada e exigida no workflow separado
`Contrato MCP central`, com PostgreSQL 18 descartável. Resultado do CI deve ser
registrado no PR; a execução local não foi possível porque o runtime não permite
troca de usuário/grupos para iniciar postgres. Não foi solicitado privilégio.
Nenhuma mudança em produção, migração real, aprovação operacional ou segredo
foi executado/exposto. AVL-431 permanece em andamento até integração e evidência.
