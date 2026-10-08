"use client";

import { useState } from "react";
import CampoCodigo from "@/components/CampoCodigo";

/**
 * O desafio: seis dígitos do aplicativo, ou um código de recuperação.
 *
 * `recomecar` na resposta significa que o bilhete do login morreu (expirou ou
 * estourou o limite de tentativas): a tela devolve à senha em vez de deixar a
 * pessoa batendo num campo que não vai mais aceitar nada.
 */
export default function FormDesafio({ email, appId }: { email: string; appId: string | null }) {
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/mfa/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      const dados = await res.json();
      if (!res.ok) {
        if (dados.recomecar) {
          window.location.assign(`/login${appId ? `?app=${encodeURIComponent(appId)}` : ""}`);
          return;
        }
        setErro(dados.erro || "Código incorreto.");
        setCodigo("");
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
      <p className="text-xs leading-relaxed text-[var(--color-texto-fraco)]">
        Abra seu aplicativo autenticador e digite o código de <strong>{email}</strong>.
      </p>

      <CampoCodigo valor={codigo} aoMudar={setCodigo} rotulo="Código" />

      {erro && <p role="alert" className="text-xs leading-relaxed text-red-400">{erro}</p>}

      <button
        type="submit"
        disabled={enviando || codigo.trim().length < 6}
        className="rounded-lg bg-[var(--color-marca-solida)] px-4 py-2.5 text-sm font-semibold text-[var(--color-marca-contraste)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {enviando ? "Conferindo…" : "Entrar"}
      </button>

      <p className="text-center text-xs leading-relaxed text-[var(--color-texto-fraco)]">
        Sem o celular? Use um dos códigos de recuperação no mesmo campo. Sem eles, fale com a
        equipe Avila Ops.
      </p>
    </form>
  );
}
