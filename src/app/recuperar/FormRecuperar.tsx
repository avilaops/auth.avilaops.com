"use client";

import { useState } from "react";

export default function FormRecuperar({ app, returnTo }: { app: string | null; returnTo: string | null }) {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(event: React.FormEvent) {
    event.preventDefault();
    setEnviando(true); setErro(null);
    try {
      const res = await fetch("/api/auth/recuperar/solicitar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, app, returnTo }),
      });
      const dados = await res.json();
      if (!res.ok) return setErro(dados.erro || "Não foi possível solicitar o link. Tente novamente.");
      setMensagem(dados.mensagem);
    } catch { setErro("Falha de conexão. Tente de novo."); }
    finally { setEnviando(false); }
  }

  if (mensagem) return (
    <div role="status" className="flex flex-col gap-3 text-sm">
      <p className="font-medium">Confira seu e-mail</p>
      <p className="text-[var(--color-texto-fraco)]">{mensagem}</p>
      <p className="text-[var(--color-texto-fraco)]">O link vale por 1 hora. Abra-o para escolher sua nova senha.</p>
      <button type="button" onClick={() => setMensagem(null)} className="inline-flex min-h-11 items-center self-start text-[var(--color-marca)] hover:underline">Usar outro e-mail</button>
    </div>
  );

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-xs text-[var(--color-texto-fraco)]">
        E-mail da sua conta
        <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required maxLength={254}
          value={email} onChange={event => setEmail(event.target.value)}
          className="min-h-11 w-full rounded-lg border border-[var(--color-borda)] bg-[var(--color-fundo)] px-3 py-2 text-base outline-none focus:border-[var(--color-marca)] sm:text-sm" />
      </label>
      {erro && <p role="alert" className="text-sm text-[var(--color-marca-vermelho)]">{erro}</p>}
      <button type="submit" disabled={enviando} className="min-h-11 rounded-lg bg-[var(--color-marca-solida)] px-4 py-2.5 text-sm font-semibold text-[var(--color-marca-contraste)] hover:opacity-90 disabled:opacity-60">
        {enviando ? "Enviando…" : "Enviar link de recuperação"}
      </button>
    </form>
  );
}
