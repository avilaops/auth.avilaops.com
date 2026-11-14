# Conta • portal funcional

Pedido: melhorar conta.avilaops.com com acompanhamento pelo Linear. A continuidade
permanece em DEV local, conforme a sessão. O usuário confirmou a prioridade de
uso da conta com perfil, segurança, empresas e conexões.

## Resultado esperado

- Início com sistemas autorizados e atalhos claros para perfil, segurança,
  empresas e conexões. Cada área tem navegação e título próprios.
- Perfil mantém edição real de nome, telefone e foto. Identidade, atividade e
  papel da conta são revalidados no servidor; cookie antigo não mantém acesso
  depois de bloqueio, mudança de endereço ou mudança entre equipe e cliente no SSO.
- Segurança oferece confirmação real do endereço atual. O link expira em 30
  minutos, exige confirmação por POST e só pode ser consumido uma vez. GET não
  verifica o e-mail. A confirmação não cria sessão nem habilita MFA.
- Emissão exige sessão correspondente à conta ativa. Reserva atômica no banco
  das contas limita um envio por minuto e três por hora. Persistir somente hash.
- Alterar o e-mail invalida tokens anteriores, inclusive trocar e depois voltar
  ao mesmo endereço. A exclusão da conta remove seus desafios. Normalização de
  caixa/espaços preserva a confirmação. Alterar nome/telefone não invalida links.
- Empresas fica em seção própria com paginação. Não há concessão de acesso,
  criação de empresa ou convite inferido neste portal.
- Conexões fica na navegação da conta, com nomes de aplicação/empresa/unidade,
  operações concedidas e revogação real limitada ao sujeito autenticado.
  A revogação invalida a conexão e seus refresh tokens na mesma transação e
  registra auditoria. O endereço legado /conexoes continua funcionando.
- Não mostrar controles de SMS/MFA por e-mail que ainda não executam ações.
  Preservar o autenticador e as políticas MFA existentes.
- Usar • como separador nos novos textos e títulos. Preservar as alterações
  locais de metadata encontradas no início.

## Persistência e operação

A confirmação fica em tabela própria no PORTAL_DATABASE_URL, junto com a conta,
permitindo consumo e atualização de email_verificado em uma só transação.
Migração aditiva e idempotente cria a versão do endereço e gatilhos de invalidação
para todos os escritores da tabela compartilhada. Não reconstruir confirmações
históricas ou alterar papéis. Atualizar o runner e validar em schemas descartáveis.

SMTP/n8n existentes fazem entrega em ambientes configurados; DEV captura no disco.
Sem entrega configurada, exibir indisponibilidade explícita. SMS, MFA por e-mail,
migração de consumidores e publicação permanecem fora desta rodada.

## Aceite

Cobrir concorrência, expiração, reuso, envio limitado, mudança de endereço, falha
com rollback, conta bloqueada e autorização cruzada em PostgreSQL real. Verificar
navegação, confirmação recebida localmente, revogação e estados vazios em navegador
desktop/mobile, claro/escuro. Entregar em PR draft com evidências no Linear.

Referência das decisões de confirmação: [OWASP • Email Validation and Verification](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html).
