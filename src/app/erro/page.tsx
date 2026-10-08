export const dynamic = "force-dynamic";
export const metadata = { title: "Não foi possível entrar" };

const MENSAGENS: Record<string, { titulo: string; detalhe: string }> = {
  sem_permissao: {
    titulo: "Acesso restrito",
    detalhe:
      "Este sistema aceita apenas contas @avilaops.com. Se você é cliente, entre pelo endereço do seu sistema.",
  },
  email_nao_verificado: {
    titulo: "E-mail não verificado",
    detalhe: "O Google não confirmou este endereço. Verifique a conta e tente de novo.",
  },
  app_desconhecido: {
    titulo: "Sistema não reconhecido",
    detalhe: "O login foi aberto sem indicar um sistema válido.",
  },
  fluxo_expirado: {
    titulo: "Sessão de login expirada",
    detalhe: "Você demorou mais que o permitido. Comece de novo.",
  },
  fluxo_invalido: {
    titulo: "Sessão de login inválida",
    detalhe: "Não foi possível retomar o login. Comece de novo.",
  },
  state_invalido: {
    titulo: "Login interrompido",
    detalhe: "A verificação de segurança falhou. Comece de novo por precaução.",
  },
  google_nao_configurado: {
    titulo: "Login com Google indisponível",
    detalhe:
      "O serviço está no ar, mas as credenciais do Google ainda não foram configuradas. Fale com a equipe da Avila Ops.",
  },
  cancelado: { titulo: "Login cancelado", detalhe: "Você cancelou a autorização no provedor." },
  sem_codigo: { titulo: "Login incompleto", detalhe: "O provedor não devolveu o código." },
  falha_google: {
    titulo: "Falha ao falar com o Google",
    detalhe: "Não conseguimos validar sua identidade agora. Tente de novo em instantes.",
  },
  falha_provedor: {
    titulo: "Falha ao falar com o provedor",
    detalhe: "Não conseguimos validar sua identidade agora. Tente de novo em instantes.",
  },
  provedor_desconhecido: { titulo: "Provedor não reconhecido", detalhe: "Esse método de login não existe." },
  provedor_desligado: {
    titulo: "Método de login indisponível",
    detalhe: "Esse conector está desligado ou sem credenciais. Entre com e-mail e senha.",
  },
  sessao_necessaria: { titulo: "Entre primeiro", detalhe: "Para vincular um login, entre na sua conta com a senha." },
  sem_email: {
    titulo: "Sem e-mail",
    detalhe: "O provedor não informou um e-mail para a sua conta. Adicione um e-mail lá e tente de novo, ou entre com senha.",
  },
  vincule_primeiro: {
    titulo: "Conta da equipe",
    detalhe:
      "Esse e-mail é de uma conta da equipe Avila Ops. Por segurança, entre com a senha e vincule o login social em /conta.",
  },
  meta_indisponivel: {
    titulo: "Conexão com a Meta indisponível",
    detalhe: "A conexão ainda não foi configurada. Fale com a equipe da Avila Ops.",
  },
  conta_inexistente: { titulo: "Conta não encontrada", detalhe: "Não há conta para esse e-mail." },
};

const PADRAO = { titulo: "Não foi possível entrar", detalhe: "Tente novamente." };

export default async function ErroPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;
  const { titulo, detalhe } = (motivo && MENSAGENS[motivo]) || PADRAO;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="w-full max-w-sm text-center">
        <div className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
          <h1 className="text-base font-semibold">{titulo}</h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-texto-fraco)]">{detalhe}</p>
        </div>
        <p className="mt-6 text-xs text-[var(--color-texto-fraco)]">Avila Ops Tecnologia</p>
      </div>
    </main>
  );
}
