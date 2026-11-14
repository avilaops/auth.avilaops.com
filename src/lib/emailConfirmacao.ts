import { urlAbsoluta } from "@/lib/urls";

const escapar = (valor: string) => valor.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function emailDeConfirmacaoDaConta(nome: string, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Token de confirmação inválido");
  const link = urlAbsoluta(`/conta/confirmar-email/${token}`);
  return {
    assunto: "Confirme seu e-mail • Avila Ops",
    texto: `Olá, ${nome}.\n\nConfirme o endereço da sua conta Avila Ops:\n${link}\n\nO link vale por 30 minutos e só pode ser usado uma vez. Ele não altera sua senha nem ativa a verificação em duas etapas.\nSe você não pediu esta mensagem, pode ignorá-la.`,
    html: `<p>Olá, ${escapar(nome)}.</p><p>Confirme o endereço da sua conta Avila Ops.</p><p><a href="${escapar(link)}">Confirmar meu e-mail</a></p><p>O link vale por 30 minutos e só pode ser usado uma vez. Ele não altera sua senha nem ativa a verificação em duas etapas.</p><p>Se você não pediu esta mensagem, pode ignorá-la.</p>`,
  };
}
