import type { Papel } from "@/lib/apps";
import { lerDesafio, type Desafio } from "@/lib/desafio";
import { lerSessao, type Sessao } from "@/lib/sessao";

/**
 * Quem está do outro lado de um pedido de segundo fator.
 *
 * As mesmas telas servem dois momentos diferentes: o login parado no meio
 * (existe desafio, não existe sessão) e a pessoa já logada mexendo em
 * `/conta` (existe sessão). Resolver isso uma vez aqui evita que cada rota
 * invente sua própria regra — e é na regra inventada que mora o buraco.
 *
 * O desafio vem primeiro de propósito: quem está terminando um login é o caso
 * mais restrito, e uma sessão velha no navegador não pode sequestrar o fluxo.
 */
export type Autor =
  | { origem: "desafio"; email: string; papel: Papel; desafio: Desafio }
  | { origem: "sessao"; email: string; papel: Papel; sessao: Sessao };

export async function identificarAutor(): Promise<Autor | null> {
  const desafio = await lerDesafio();
  if (desafio) return { origem: "desafio", email: desafio.email, papel: desafio.papel, desafio };

  const sessao = await lerSessao();
  if (sessao) return { origem: "sessao", email: sessao.email, papel: sessao.papel, sessao };

  return null;
}
