import { moldura } from "@/lib/cadastroProprio";

/** O link é o único segredo; não há senha nem dados da conta na mensagem. */
export function emailDeRecuperacao(link: string) {
  return {
    assunto: "Redefinir sua senha • Ávila Ops",
    texto: `Recebemos um pedido para redefinir a senha da sua conta Ávila Ops.\n\nPara escolher uma senha nova, abra este link:\n\n${link}\n\nO link vale por 1 hora e pode ser usado uma única vez. Se você não pediu a recuperação, ignore esta mensagem: sua senha continua a mesma.\n\nÁvila Ops`,
    html: moldura("Redefinir sua senha", "Recebemos um pedido de recuperação da sua conta Ávila Ops. Escolha uma senha nova pelo botão abaixo.",
      { rotulo: "Redefinir minha senha", link },
      "O link vale por 1 hora e pode ser usado uma única vez. Se você não pediu a recuperação, ignore esta mensagem: sua senha continua a mesma."),
  };
}
