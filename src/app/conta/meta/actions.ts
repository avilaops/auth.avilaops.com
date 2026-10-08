"use server";

import { redirect } from "next/navigation";
import { appMeta, desconectar, sincronizar } from "@/lib/conexaoMeta";
import { registrar } from "@/lib/eventos";
import { lerSessao } from "@/lib/sessao";

export async function acaoSincronizarMeta(): Promise<void> {
  const sessao = await lerSessao();
  if (!sessao) throw new Error("Sessão expirada");
  const app = await appMeta();
  if (!app) redirect("/conta/meta?aviso=falhou");

  let aviso = "atualizado";
  try {
    await sincronizar(sessao.sub, app);
  } catch (e) {
    // Token vencido ou revogado no Facebook cai aqui: a tela pede para conectar
    // de novo em vez de mostrar uma lista que já não corresponde a nada.
    console.error("[meta] sincronizar", e instanceof Error ? e.message : e);
    await registrar({ tipo: "meta_falhou", email: sessao.email, detalhe: e instanceof Error ? e.message : String(e) });
    aviso = "falhou";
  }
  redirect(`/conta/meta?aviso=${aviso}`);
}

export async function acaoDesconectarMeta(): Promise<void> {
  const sessao = await lerSessao();
  if (!sessao) throw new Error("Sessão expirada");
  if (await desconectar(sessao.sub, await appMeta())) {
    await registrar({ tipo: "meta_desconectada", email: sessao.email, detalhe: "pelo próprio", autor: sessao.email });
  }
  redirect("/conta/meta?aviso=desconectado");
}
