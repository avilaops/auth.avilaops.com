"use client";

import { useState } from "react";
import { CampoSenha } from "@/components/CampoSenha";

/**
 * Formulário de senha reaproveitado em dois fluxos:
 * - troca pelo usuário logado (`/trocar-senha`, pede a atual);
 * - recuperação por link (`/recuperar/[token]`, não pede a atual);
 * - confirmação do cadastro próprio (`/criar/confirmar/[token]`), que usa a
 *   mesma forma de link e manda para outra rota (`rota`).
 */
export default function FormSenha({ destino, token, rota, rotuloBotao }: { destino: string; token?: string; rota?: string; rotuloBotao?: string }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (nova !== confirma) return setErro("As senhas não conferem.");
    setEnviando(true);
    try {
      const res = await fetch(rota ?? (token ? "/api/auth/recuperar" : "/api/auth/trocar-senha"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { token, nova } : { atual, nova }),
      });
      const dados = await res.json();
      if (!res.ok) return setErro(dados.erro || "Não foi possível salvar.");
      window.location.assign(dados.destino || destino);
    } catch {
      setErro("Falha de conexão. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      {!token && (
        <CampoSenha label="Senha atual" value={atual} onChange={setAtual} required />
      )}
      <CampoSenha label={rota ? "Senha (mín. 8)" : "Nova senha (mín. 8)"} value={nova} onChange={setNova} autoComplete="new-password" minLength={8} required />
      <CampoSenha label="Confirmar" value={confirma} onChange={setConfirma} autoComplete="new-password" required />
      {erro && <p role="alert" className="text-xs text-[var(--color-marca-vermelho)]">{erro}</p>}
      <button type="submit" disabled={enviando} className="mt-1 rounded-lg bg-[var(--color-marca-solida)] px-4 py-2.5 text-sm font-semibold text-[var(--color-marca-contraste)] hover:opacity-90 disabled:opacity-60">
        {enviando ? "Salvando…" : (rotuloBotao ?? "Salvar senha")}
      </button>
    </form>
  );
}
