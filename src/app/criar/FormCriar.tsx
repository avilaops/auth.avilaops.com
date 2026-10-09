"use client";

import { useState } from "react";

const campo =
  "min-h-11 w-full rounded-lg border border-[var(--color-borda)] bg-[var(--color-fundo)] px-3 py-2 text-base outline-none focus:border-[var(--color-marca)] sm:text-sm";

/** Primeiro passo do cadastro: nome e e-mail. A senha vem depois, no link. */
export default function FormCriar({ app, returnTo }: { app: string | null; returnTo: string | null }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/criar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, email, app, returnTo }),
      });
      const dados = await res.json();
      if (!res.ok) return setErro(dados.erro || "Não foi possível enviar.");
      setEnviado(dados.mensagem);
    } catch {
      setErro("Falha de conexão. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div role="status" className="flex flex-col gap-3 text-sm">
        <p className="font-medium">Confira seu e-mail</p>
        <p className="text-[var(--color-texto-fraco)]">{enviado}</p>
        <p className="text-[var(--color-texto-fraco)]">O link vale por 24 horas e abre a tela para você escolher a senha.</p>
        <button type="button" onClick={() => setEnviado(null)} className="self-start text-xs text-[var(--color-marca)] hover:underline">
          Usar outro e-mail
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-xs text-[var(--color-texto-fraco)]">
        Nome
        <input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required minLength={2} maxLength={120} className={campo} />
      </label>
      <label className="flex flex-col gap-1.5 text-xs text-[var(--color-texto-fraco)]">
        E-mail
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required maxLength={254} className={campo} />
      </label>
      {erro && <p role="alert" className="text-xs text-[var(--color-marca-vermelho)]">{erro}</p>}
      <button type="submit" disabled={enviando} className="mt-1 min-h-11 rounded-lg bg-[var(--color-marca-solida)] px-4 py-2.5 text-sm font-semibold text-[var(--color-marca-contraste)] hover:opacity-90 disabled:opacity-60">
        {enviando ? "Enviando…" : "Enviar link de confirmação"}
      </button>
    </form>
  );
}
