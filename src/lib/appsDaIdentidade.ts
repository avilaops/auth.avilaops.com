import type { Papel } from "@/lib/apps";
import { listarCadastro } from "@/lib/cadastro";
import { appsDaConta } from "@/lib/menuDeApps";
import { listarPermissoes } from "@/lib/permissoes";

/** A claim `apps` de uma identidade, lida do cadastro e das liberações de agora. */
export async function appsDaIdentidade(i: { email: string; papel: Papel }): Promise<string[]> {
  const [cadastro, liberados] = await Promise.all([listarCadastro(), listarPermissoes(i.email)]);
  return appsDaConta(cadastro, i.papel, liberados);
}
