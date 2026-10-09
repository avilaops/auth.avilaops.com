"use client";

import { useState } from "react";
import { CampoSenha } from "@/components/CampoSenha";

/**
 * Formulário de acesso da equipe.
 *
 * O `app` e o `returnTo` vêm resolvidos do servidor — o `returnTo` já passou
 * pela validação de host lá, então aqui é só repassar.
 */
export default function FormLogin({
  app,
  returnTo,
}: {
  app: string | null;
  returnTo: string | null;
}) {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, senha, app, returnTo }),
      });
      const dados = await res.json();
      if (!res.ok) {
        setErro(dados.erro || "Não foi possível entrar.");
        return;
      }
      window.location.assign(dados.destino || "/");
    } catch {
      setErro("Falha de conexão. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[var(--color-texto-fraco)]">
          E-mail ou CPF
        </span>
        <input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          required
          className="rounded-lg border border-[var(--color-borda)] bg-[var(--color-fundo)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-marca)]"
        />
      </label>

      <CampoSenha label="Senha" value={senha} onChange={setSenha} required />

      {erro && (
        <p role="alert" className="text-xs leading-relaxed text-[var(--color-marca-vermelho)]">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="mt-1 rounded-lg bg-[var(--color-marca-solida)] px-4 py-2.5 text-sm font-semibold text-[var(--color-marca-contraste)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
