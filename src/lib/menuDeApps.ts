import { motivoDoAcesso, paraApp, recebeLogin, type Cadastro, type Papel } from "@/lib/apps";
import { HOST_DA_CONTA, ID_DO_APP_CONTA } from "@/lib/hostDaConta";

/**
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

export function menuDeApps(cadastro: Cadastro[], papel: Papel, liberados: string[]): MenuDeApps {
  const liberado = new Set(liberados);
  const apps = cadastro
    .filter((c) => c.id !== ID_DO_APP_CONTA && c.situacao === "no_ar" && recebeLogin(c))
    .filter((c) => motivoDoAcesso(paraApp(c), papel, liberado.has(c.id)) !== null)
    .map((c) => ({ id: c.id, nome: c.nome, url: `https://${c.host}/` }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { conta: `https://${HOST_DA_CONTA}/`, apps };
}
