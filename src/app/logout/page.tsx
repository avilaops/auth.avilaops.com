import { redirect } from "next/navigation";
import { PARAMETROS_LOGOUT } from "@/lib/pedidoLogout";

export const dynamic = "force-dynamic";

/** Endereço comum de saída: encaminha à confirmação protegida de `/sair`. */
export default async function LogoutAlias({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;
  const consulta = new URLSearchParams();
  for (const nome of [...PARAMETROS_LOGOUT, "id_token_hint"]) {
    const valor = parametros[nome];
    for (const item of Array.isArray(valor) ? valor : valor === undefined ? [] : [valor]) consulta.append(nome, item);
  }
  redirect(`/sair${consulta.size ? `?${consulta.toString()}` : ""}`);
}
