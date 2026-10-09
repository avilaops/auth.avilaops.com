"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import CadastroSegundoFator from "@/components/CadastroSegundoFator";
import CampoCodigo from "@/components/CampoCodigo";
import CodigosRecuperacao from "@/components/CodigosRecuperacao";

type Estado = {
  ativo: boolean;
  confirmadoEm: string | null;
  codigosRestantes: number;
  obrigatorio: boolean;
  disponivel: boolean;
};

const botao = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--color-borda)] px-4 py-2 text-sm hover:bg-[var(--color-fundo)] disabled:opacity-60";
const botaoForte = "inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--color-marca-solida)] px-4 py-2 text-sm font-semibold text-[var(--color-marca-contraste)] hover:opacity-90 disabled:opacity-60";

/**
 * A verificação em duas etapas na página da própria pessoa.
 *
 * Tudo que mexe no fator — desligar, trocar de aparelho, gerar códigos novos —
 * pede um código válido na hora. Sessão aberta não basta: se bastasse, quem
 * senta num computador destrancado desfaz em dois cliques exatamente a
 * proteção que existe para esse dia.
 */
export default function SegundoFator({ estado }: { estado: Estado }) {
  const router = useRouter();
  const [cadastrando, setCadastrando] = useState(false);
  const [acao, setAcao] = useState<null | "codigos" | "trocar" | "desativar">(null);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [codigosNovos, setCodigosNovos] = useState<string[] | null>(null);

  function limpar() {
    setAcao(null);
    setCodigo("");
    setErro(null);
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const rota = acao === "codigos" ? "/api/auth/mfa/codigos" : "/api/auth/mfa/desativar";
      const res = await fetch(rota, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, trocar: acao === "trocar" }),
      });
      const dados = await res.json();
      if (!res.ok) {
        setErro(dados.erro || "Não foi possível concluir.");
        return;
      }
      if (acao === "codigos") {
        setCodigosNovos(dados.codigos);
        limpar();
        return;
      }
      const trocando = acao === "trocar";
      limpar();
      if (trocando) setCadastrando(true);
      else router.refresh();
    } catch {
      setErro("Falha de conexão. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (!estado.disponivel) {
    return (
      <p className="text-xs leading-relaxed text-[var(--color-marca-amarelo)]">
        Indisponível no servidor: falta a chave de cifra (<code>AUTH_ENCRYPTION_KEY</code>). Fale
        com a equipe Avila Ops.
      </p>
    );
  }

  if (codigosNovos) {
    return (
      <CodigosRecuperacao
        codigos={codigosNovos}
        email=""
        rotuloBotao="Pronto"
        aoConfirmar={() => {
          setCodigosNovos(null);
          router.refresh();
        }}
      />
    );
  }

  if (cadastrando) {
    return (
      <CadastroSegundoFator
        rotuloBotao="Pronto"
        aoConcluir={() => {
          setCadastrando(false);
          router.refresh();
        }}
      />
    );
  }

  if (!estado.ativo) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs leading-relaxed text-[var(--color-texto-fraco)]">
          {estado.obrigatorio
            ? "Sua conta é da equipe Avila Ops: o segundo fator é obrigatório e será pedido no próximo login."
            : "Um código de 6 dígitos do seu celular, além da senha. Protege sua conta mesmo que a senha vaze."}
        </p>
        <button type="button" onClick={() => setCadastrando(true)} className={`${botaoForte} self-start`}>
          Ativar agora
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-[var(--verde-suave)] px-2 py-0.5 text-xs text-[var(--color-verde)]">ativa</span>
        <span className="text-xs text-[var(--color-texto-fraco)]">
          {estado.confirmadoEm && `desde ${estado.confirmadoEm} · `}
          {estado.codigosRestantes} {estado.codigosRestantes === 1 ? "código de recuperação" : "códigos de recuperação"}
        </span>
      </div>

      {estado.codigosRestantes <= 2 && (
        <p className="text-xs text-[var(--color-marca-amarelo)]">
          Restam poucos códigos de recuperação. Gere uma lista nova enquanto ainda tem o celular.
        </p>
      )}

      {acao === null ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAcao("codigos")} className={botao}>Novos códigos de recuperação</button>
          <button type="button" onClick={() => setAcao("trocar")} className={botao}>Trocar de aparelho</button>
          {!estado.obrigatorio && (
            <button type="button" onClick={() => setAcao("desativar")} className={botao}>Desativar</button>
          )}
        </div>
      ) : (
        <form onSubmit={confirmar} className="flex flex-col gap-3 rounded-xl border border-[var(--color-borda)] bg-[var(--color-fundo)] p-4">
          <p className="text-xs leading-relaxed text-[var(--color-texto-fraco)]">
            {acao === "codigos" && "Gerar códigos novos invalida os atuais. Confirme com um código do aplicativo:"}
            {acao === "trocar" && "O aparelho atual deixa de valer e você lê um QR novo. Confirme com um código do aplicativo atual:"}
            {acao === "desativar" && "Sua conta volta a depender só da senha. Confirme com um código do aplicativo:"}
          </p>
          <CampoCodigo valor={codigo} aoMudar={setCodigo} rotulo="Código" />
          {erro && <p role="alert" className="text-xs text-[var(--color-marca-vermelho)]">{erro}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={enviando || codigo.trim().length < 6} className={botaoForte}>
              {enviando ? "Conferindo…" : "Confirmar"}
            </button>
            <button type="button" onClick={limpar} className={botao}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
