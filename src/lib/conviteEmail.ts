import { escapar, moldura } from "@/lib/cadastroProprio";

/**
 * O e-mail do convite, quando é o login que escreve para a pessoa.
 *
 * Sistema sem caixa de e-mail própria (TMS, CRM) pedia o endereço de criar
 * senha e o mostrava em tela para alguém copiar. Aqui o endereço nem sai do
 * login: vai direto à caixa de quem foi convidado.
 */

export type DadosDoConvite = {
  /** Nome da pessoa convidada. */
  nome: string;
  /** Nome do sistema, como está no cadastro de aplicações ("TMS", "CRM"). */
  sistema: string;
  /** Endereço do sistema, para as próximas entradas. */
  enderecoDoSistema: string;
  /** Empresa dentro do sistema, quando o sistema informa. */
  empresa: string | null;
  /** Quem convidou, quando o sistema informa. */
  convidadoPor: string | null;
  /** Endereço de criar senha; nulo para quem já tem conta e senha. */
  link: string | null;
};

/**
 * Texto que veio de outro sistema e vai para assunto e corpo: sem quebra de
 * linha nem caractere de controle (cabeçalho de e-mail não pode ganhar linha
 * nova), aparado e limitado.
 */
export function textoDeFora(v: unknown, max = 80): string | null {
  if (typeof v !== "string") return null;
  const limpo = v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return limpo ? limpo.slice(0, max) : null;
}

export function emailDeConvite(d: DadosDoConvite) {
  const primeiro = d.nome.trim().split(/\s+/)[0];
  const onde = d.empresa ? `${d.sistema} de ${d.empresa}` : d.sistema;
  const quem = d.convidadoPor ?? "A equipe";
  const abertura = `${quem} liberou o seu acesso: ${onde}.`;
  const assunto = `Seu acesso: ${onde}`;

  if (d.link) {
    return {
      assunto,
      texto: `Olá, ${primeiro}.\n\n${abertura}\n\n1. Crie a sua senha neste endereço (vale por 7 dias e funciona uma vez):\n\n${d.link}\n\nAo salvar a senha você já entra no sistema.\n\n2. Nas próximas vezes, entre por este endereço com o seu e-mail e a senha criada:\n\n${d.enderecoDoSistema}\n\nSe você não esperava este convite, ignore esta mensagem.\n\nÁvila Ops`,
      html: moldura(
        "Crie a sua senha",
        `Olá, ${escapar(primeiro)}. ${escapar(abertura)} Crie a sua senha; ao salvar, você já entra no sistema.`,
        { rotulo: "Criar senha e entrar", link: d.link },
        `O endereço vale por 7 dias e funciona uma vez. Nas próximas vezes, entre por ${escapar(d.enderecoDoSistema)} com este e-mail e a senha criada. Se você não esperava este convite, ignore esta mensagem.`,
      ),
    };
  }

  return {
    assunto,
    texto: `Olá, ${primeiro}.\n\n${abertura}\n\nVocê já tem conta Ávila Ops com este e-mail: entre com a senha que já usa.\n\n${d.enderecoDoSistema}\n\nSe não lembra a senha, peça a quem lhe convidou para falar com a Ávila Ops.\n\nÁvila Ops`,
    html: moldura(
      "Seu acesso foi liberado",
      `Olá, ${escapar(primeiro)}. ${escapar(abertura)} Você já tem conta Ávila Ops com este e-mail: entre com a senha que já usa.`,
      { rotulo: `Entrar: ${d.sistema}`, link: d.enderecoDoSistema },
      "Se não lembra a senha, peça a quem lhe convidou para falar com a Ávila Ops.",
    ),
  };
}

/** O que aconteceu com o envio, dito ao sistema que pediu. */
export type Envio = "enviado" | "nao_pedido" | "sem_email" | "limite" | "falhou";
