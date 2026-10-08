"use server";

import { revalidatePath } from "next/cache";
import { exigirAdminAction } from "@/lib/admin";
import { ligarConector, salvarConector } from "@/lib/conectores";
import { chaveConfigurada } from "@/lib/cripto";
import { registrar } from "@/lib/eventos";
import { buscarProvedor } from "@/lib/provedores";
import type { Resultado } from "../actions";

function texto(fd: FormData, campo: string): string {
  const v = fd.get(campo);
  return typeof v === "string" ? v.trim() : "";
}

export async function acaoSalvarConector(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const id = texto(fd, "id");
  const p = buscarProvedor(id);
  if (!p) return { ok: false, erro: "Provedor desconhecido." };
  if (!chaveConfigurada()) return { ok: false, erro: "AUTH_ENCRYPTION_KEY não está configurada no servidor." };

  const clientId = texto(fd, "clientId");
  if (!clientId) return { ok: false, erro: "Client ID é obrigatório." };

  const extras: Record<string, string> = {};
  for (const c of p.extras ?? []) extras[c.chave] = texto(fd, `extra_${c.chave}`);

  try {
    await salvarConector(id, { clientId, clientSecret: texto(fd, "clientSecret") || null, extras }, admin.email);
    await registrar({ tipo: "conector_alterado", autor: admin.email, detalhe: `${id}: credenciais salvas` });
    revalidatePath("/admin/conectores");
    revalidatePath(`/admin/conectores/${id}`);
    return { ok: true, mensagem: "Credenciais salvas." };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function acaoLigarConector(_: Resultado | null, fd: FormData): Promise<Resultado> {
  const admin = await exigirAdminAction();
  const id = texto(fd, "id");
  const ligar = texto(fd, "ligado") === "1";
  if (!buscarProvedor(id)) return { ok: false, erro: "Provedor desconhecido." };

  await ligarConector(id, ligar, admin.email);
  await registrar({ tipo: "conector_alterado", autor: admin.email, detalhe: `${id}: ${ligar ? "ligado" : "desligado"}` });
  revalidatePath("/admin/conectores");
  revalidatePath(`/admin/conectores/${id}`);
  revalidatePath("/login");
  return { ok: true, mensagem: ligar ? "Conector ligado — já aparece na tela de login." : "Conector desligado." };
}
