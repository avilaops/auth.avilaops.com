import { motivoDoAcesso, paraApp, recebeLogin, type Cadastro, type Papel } from "@/lib/apps";
import { HOST_DA_CONTA, ID_DO_APP_CONTA } from "@/lib/hostDaConta";

/**
 * O que cada conta pode abrir: a lista do menu de apps e a claim `apps`.
 *
 * A lista do menu de apps do ecossistema: o que esta conta pode abrir agora.
 *
 * É a mesma regra do login (`motivoDoAcesso`), para o menu nunca mostrar um
 * ícone que o login recusaria. Entra só o que recebe sessão e está no ar:
 * aplicação planejada, fora do ar ou desativada não é destino de menu.
 *
 * A conta fica de fora da grade e vai num campo próprio: nos menus ela é o
 * avatar, não um ícone entre os outros.
 */
export type ItemDoMenu = { id: string; nome: string; url: string };
export type MenuDeApps = { conta: string; apps: ItemDoMenu[] };

/** As linhas do cadastro em que esta conta entra, pela regra do login. */
function ondeAContaEntra(cadastro: Cadastro[], papel: Papel, liberados: string[]): Cadastro[] {
  const liberado = new Set(liberados);
  return cadastro.filter((c) => recebeLogin(c) && motivoDoAcesso(paraApp(c), papel, liberado.has(c.id)) !== null);
}

/**
 * Identificadores das aplicações que a conta pode abrir: é a claim `apps` do
 * `id_token` e do `/oauth/userinfo`.
 *
 * Diferente do menu, não olha se a aplicação está no ar: a claim responde
 * "esta conta tem direito de entrar?", e isso não muda porque o sistema caiu.
 */
export function appsDaConta(cadastro: Cadastro[], papel: Papel, liberados: string[]): string[] {
  return ondeAContaEntra(cadastro, papel, liberados).map((c) => c.id).sort();
}

export function menuDeApps(cadastro: Cadastro[], papel: Papel, liberados: string[]): MenuDeApps {
  const apps = ondeAContaEntra(cadastro, papel, liberados)
    .filter((c) => c.id !== ID_DO_APP_CONTA && c.situacao === "no_ar")
    .map((c) => ({ id: c.id, nome: c.nome, url: `https://${c.host}/` }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { conta: `https://${HOST_DA_CONTA}/`, apps };
}
