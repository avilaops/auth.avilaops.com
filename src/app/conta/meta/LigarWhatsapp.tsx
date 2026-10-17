"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { lerEventoCadastro, origemDaMeta, type EventoCadastro } from "@/lib/cadastroWhatsapp";

type RespostaLogin = { authResponse?: { code?: string } | null };
type SdkMeta = {
  init: (o: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
  login: (retorno: (r: RespostaLogin) => void, o: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    FB?: SdkMeta;
    fbAsyncInit?: () => void;
  }
}

const SDK = "https://connect.facebook.net/pt_BR/sdk.js";
/** Quanto esperar a mensagem da janela depois que o código chega. O código vale 30 segundos. */
const ESPERA_DA_MENSAGEM_MS = 8000;

type Estado =
  | { fase: "carregando" | "pronto" | "abrindo" | "enviando" }
  | { fase: "ligado"; texto: string; aviso: boolean }
  | { fase: "erro"; texto: string };

/**
 * Botão do cadastro incorporado do WhatsApp (Embedded Signup v4).
 *
 * Carrega o SDK da Meta só nesta tela e abre a janela da Meta com a
 * configuração do painel. A janela devolve o código (no retorno do `FB.login`)
 * e a conta e o número (por `postMessage`); com os dois em mãos, a tela os
 * manda ao servidor, que troca o código e grava.
 */
export default function LigarWhatsapp({ appId, configId, versao }: { appId: string; configId: string; versao: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const evento = useRef<EventoCadastro | null>(null);

  useEffect(() => {
    const ouvir = (e: MessageEvent) => {
      if (!origemDaMeta(e.origin)) return;
      const lido = lerEventoCadastro(e.data);
      if (lido) evento.current = lido;
    };
    window.addEventListener("message", ouvir);

    const pronto = () => setEstado((s) => (s.fase === "carregando" ? { fase: "pronto" } : s));
    if (window.FB) {
      pronto();
    } else {
      window.fbAsyncInit = () => {
        window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: versao });
        pronto();
      };
      if (!document.querySelector(`script[src="${SDK}"]`)) {
        const s = document.createElement("script");
        s.src = SDK;
        s.async = true;
        s.defer = true;
        s.crossOrigin = "anonymous";
        s.onerror = () => setEstado({ fase: "erro", texto: "Não foi possível carregar a janela da Meta. Confira a conexão e recarregue a página." });
        document.body.appendChild(s);
      }
    }
    return () => window.removeEventListener("message", ouvir);
  }, [appId, versao]);

  async function concluir(code: string | undefined) {
    if (!code) {
      setEstado({ fase: "erro", texto: "Cadastro cancelado. Nada foi ligado." });
      return;
    }
    setEstado({ fase: "enviando" });
    // A mensagem com a conta e o número pode chegar depois do código.
    const limite = Date.now() + ESPERA_DA_MENSAGEM_MS;
    while (!evento.current && Date.now() < limite) await new Promise((r) => setTimeout(r, 200));
    const e = evento.current;
    if (!e || e.estado !== "concluido") {
      setEstado({ fase: "erro", texto: e?.estado === "erro" ? e.mensagem : "A janela da Meta não informou o número. Tente de novo." });
      return;
    }
    try {
      const r = await fetch("/api/meta/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, wabaId: e.wabaId, phoneNumberId: e.phoneNumberId, businessId: e.businessId }),
      });
      const dados = (await r.json().catch(() => ({}))) as { erro?: string; numero?: string | null; nomeDaConta?: string; inscrito?: boolean };
      if (!r.ok) {
        setEstado({ fase: "erro", texto: dados.erro ?? "Não foi possível concluir. Tente de novo." });
        return;
      }
      setEstado({
        fase: "ligado",
        texto: dados.inscrito
          ? `${dados.numero ?? dados.nomeDaConta} ligado. As mensagens já chegam aos sistemas da Avila Ops.`
          : `${dados.numero ?? dados.nomeDaConta} ligado, mas a Meta ainda não liberou o recebimento das mensagens. Fale com a equipe da Avila Ops.`,
        aviso: !dados.inscrito,
      });
      router.refresh();
    } catch {
      setEstado({ fase: "erro", texto: "Sem resposta do servidor. Confira a conexão e tente de novo." });
    }
  }

  function abrir() {
    if (!window.FB) return;
    evento.current = null;
    setEstado({ fase: "abrindo" });
    // O SDK recusa função assíncrona como retorno: a parte assíncrona fica em `concluir`.
    window.FB.login(
      (r) => {
        void concluir(r.authResponse?.code ?? undefined);
      },
      { config_id: configId, response_type: "code", override_default_response_type: true, extras: { setup: {} } },
    );
  }

  // "abrindo" não trava o botão: com a janela bloqueada pelo navegador, o SDK pode não responder nunca.
  const ocupado = estado.fase === "carregando" || estado.fase === "enviando";
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={abrir}
        disabled={ocupado}
        className="min-h-11 self-start rounded-lg bg-[var(--color-marca-solida)] px-4 py-2 text-sm font-semibold text-[var(--color-marca-contraste)] hover:opacity-90 disabled:opacity-60"
      >
        {estado.fase === "carregando" ? "Carregando…" : estado.fase === "abrindo" ? "Janela da Meta aberta…" : estado.fase === "enviando" ? "Ligando o número…" : "Ligar o WhatsApp"}
      </button>
      {estado.fase === "ligado" && (
        <p role="status" className={`text-xs ${estado.aviso ? "text-[var(--color-marca-vermelho)]" : "text-[var(--color-verde)]"}`}>{estado.texto}</p>
      )}
      {estado.fase === "erro" && <p role="alert" className="text-xs text-[var(--color-marca-vermelho)]">{estado.texto}</p>}
    </div>
  );
}
