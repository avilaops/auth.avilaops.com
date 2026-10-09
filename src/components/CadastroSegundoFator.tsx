"use client";

import { useEffect, useState } from "react";
import CampoCodigo from "@/components/CampoCodigo";
import CodigosRecuperacao from "@/components/CodigosRecuperacao";

/**
 * O cadastro do segundo fator, do QR aos códigos de recuperação.
 *
 * O mesmo componente serve os dois momentos em que ele aparece: o login que
 * parou para exigir o fator e a página `/conta` de quem decidiu ativar. Quem
 * está do outro lado é resolvido no servidor (`autorMfa.ts`) — aqui não há
 * e-mail em parâmetro nenhum, nem decisão de permissão.
 */
export default function CadastroSegundoFator({
  aoConcluir,
  rotuloBotao,
}: {
  /** `destino` vem preenchido quando o cadastro terminou um login. */
  aoConcluir: (destino: string | null) => void;
  rotuloBotao?: string;
}) {
  const [carga, setCarga] = useState<{ email: string; segredo: string; uri: string; svg: string } | null>(null);
  /** Muda ao apertar "tentar de novo" e é o que refaz o pedido. */
  const [tentativa, setTentativa] = useState(0);
  const [codigo, setCodigo] = useState("");
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [destino, setDestino] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mostrarSegredo, setMostrarSegredo] = useState(false);

  // Pede o QR ao entrar na tela. O estado só é tocado no retorno da promessa,
  // nunca no corpo do efeito: mexer nele ali dispara uma segunda renderização
  // antes de a primeira terminar de pintar. O `ativo` descarta a resposta que
  // chega depois de a pessoa sair da tela.
  useEffect(() => {
    let ativo = true;
    fetch("/api/auth/mfa/iniciar", { method: "POST" })
      .then(async (res) => ({ ok: res.ok, dados: await res.json() }))
      .then(({ ok, dados }) => {
        if (!ativo) return;
        if (ok) setCarga(dados);
        else setErro(dados.erro || "Não foi possível iniciar o cadastro.");
      })
      .catch(() => {
        if (ativo) setErro("Falha de conexão. Tente de novo.");
      });
    return () => {
      ativo = false;
    };
  }, [tentativa]);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/mfa/cadastrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      const dados = await res.json();
      if (!res.ok) {
        setErro(dados.erro || "Código incorreto.");
        return;
      }
      setCodigos(dados.codigos);
      setDestino(dados.destino ?? null);
    } catch {
      setErro("Falha de conexão. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (codigos) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-verde)]">Verificação em duas etapas ativada.</p>
        <CodigosRecuperacao
          codigos={codigos}
          email={carga?.email ?? ""}
          rotuloBotao={rotuloBotao ?? (destino ? "Continuar" : "Concluir")}
          aoConfirmar={() => aoConcluir(destino)}
        />
      </div>
    );
  }

  if (!carga) {
    return erro ? (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-xs leading-relaxed text-[var(--color-marca-vermelho)]">{erro}</p>
        <button
          type="button"
          onClick={() => {
            setErro(null);
            setTentativa((n) => n + 1);
          }}
          className="self-start rounded-lg border border-[var(--color-borda)] px-4 py-2 text-sm hover:bg-[var(--color-fundo)]"
        >
          Tentar de novo
        </button>
      </div>
    ) : (
      <p className="text-xs text-[var(--color-texto-fraco)]">Preparando o código…</p>
    );
  }

  return (
    <form onSubmit={confirmar} className="flex flex-col gap-4">
      <ol className="flex flex-col gap-1 text-xs leading-relaxed text-[var(--color-texto-fraco)]">
        <li>1. Abra seu aplicativo autenticador (Google Authenticator, 1Password, Bitwarden…).</li>
        <li>2. Leia o código abaixo.</li>
        <li>3. Digite os 6 dígitos que ele mostrar.</li>
      </ol>

      {/* SVG gerado por `src/lib/qr.ts` no servidor: o conteúdo são coordenadas
          de módulos, sem texto de ninguém — não há HTML de terceiro aqui. */}
      <div
        className="mx-auto rounded-xl bg-white p-3"
        aria-label="QR code da verificação em duas etapas"
        dangerouslySetInnerHTML={{ __html: carga.svg }}
      />

      <div className="text-center text-xs text-[var(--color-texto-fraco)]">
        {mostrarSegredo ? (
          <code className="select-all break-all font-mono text-sm text-[var(--color-texto)]">{carga.segredo}</code>
        ) : (
          <button type="button" onClick={() => setMostrarSegredo(true)} className="underline underline-offset-2 hover:text-[var(--color-texto)]">
            A câmera não lê? Digitar o código manualmente
          </button>
        )}
      </div>

      <CampoCodigo valor={codigo} aoMudar={setCodigo} apenasDigitos />

      {erro && <p role="alert" className="text-xs leading-relaxed text-[var(--color-marca-vermelho)]">{erro}</p>}

      <button
        type="submit"
        disabled={enviando || codigo.length !== 6}
        className="rounded-lg bg-[var(--color-marca-solida)] px-4 py-2.5 text-sm font-semibold text-[var(--color-marca-contraste)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {enviando ? "Conferindo…" : "Ativar"}
      </button>
    </form>
  );
}
