"use client";

import { unstable_rethrow } from "next/navigation";
import { useRef, useState } from "react";
import type { Resultado } from "../actions";
import { botaoFraco } from "./estilos";

type Acao = (estado: Resultado | null, fd: FormData) => Promise<Resultado>;

/**
 * Formulário genérico ligado a uma server action. Mostra o resultado embaixo;
 * quando a ação devolve um segredo (senha, link), exibe em destaque com botão
 * de copiar — é a única vez que ele aparece.
 *
 * A ação é chamada como função comum, e o estado (enviando, resultado) fica em
 * `useState`. Já foi de dois outros jeitos, e os dois falharam em produção:
 *
 * 1. `action={dispatch}` com `useActionState`: o React limpa o formulário ao
 *    terminar, **inclusive quando a ação recusa**. A pessoa escolhia a empresa,
 *    esquecia a confirmação, via o erro e o campo já tinha voltado ao valor
 *    antigo.
 * 2. `dispatch` chamado à mão dentro de uma transição (08/10 a 09/10/2026): com
 *    o build de produção, quando a ação revalidava a própria página, o estado
 *    "enviando" às vezes nunca terminava. A integração era criada e o segredo,
 *    que só aparece uma vez, não chegava à tela.
 *
 * Aqui o "enviando" acaba quando a chamada devolve, num `finally`, e não
 * depende de a página terminar de se redesenhar. O que foi digitado fica na
 * tela quando dá erro e só é limpo quando dá certo.
 *
 * `method="post"` é para o intervalo antes de o JavaScript carregar: sem ele,
 * um envio precoce iria por GET e poria os campos (inclusive senha) na URL.
 */
export default function FormAcao({
  acao,
  children,
  className,
}: {
  acao: Acao;
  children: React.ReactNode;
  className?: string;
}) {
  const [estado, setEstado] = useState<Resultado | null>(null);
  const [pendente, setPendente] = useState(false);
  const enviando = useRef(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Toque duplo no botão: o segundo chega antes de o campo ser desligado.
    if (enviando.current) return;
    const formulario = e.currentTarget;
    const dados = new FormData(formulario, (e.nativeEvent as SubmitEvent).submitter);
    enviando.current = true;
    setPendente(true);
    try {
      const resultado = await acao(estado, dados);
      // Ação que termina em `redirect()` não devolve resultado: a página muda.
      if (!resultado) return;
      setEstado(resultado);
      if (resultado.ok) formulario.reset();
    } catch (erro) {
      // O redirecionamento chega aqui como exceção do Next; ele precisa seguir.
      unstable_rethrow(erro);
      // Sessão vencida, rede caída ou erro no servidor: a tela não pode ficar muda.
      setEstado({ ok: false, erro: "Não foi possível concluir. Confira se a alteração foi feita antes de tentar de novo." });
    } finally {
      enviando.current = false;
      setPendente(false);
    }
  }

  return (
    <form method="post" onSubmit={enviar} className={className ?? "flex flex-col gap-3"}>
      <fieldset disabled={pendente} className="contents">
        {children}
      </fieldset>
      {estado && !estado.ok && <p role="alert" className="text-xs text-[var(--color-marca-vermelho)]">{estado.erro}</p>}
      {estado?.ok && estado.mensagem && !estado.segredo && (
        <p className="text-xs text-[var(--color-verde)]">{estado.mensagem}</p>
      )}
      {estado?.ok && estado.segredo && <Segredo rotulo={estado.mensagem ?? ""} valor={estado.segredo} />}
    </form>
  );
}

function Segredo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-marca)]/40 bg-[var(--color-marca)]/10 p-3 text-xs">
      <div className="mb-1 text-[var(--color-texto-fraco)]">{rotulo}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 select-all break-all font-mono text-sm">{valor}</code>
        <button type="button" onClick={() => navigator.clipboard.writeText(valor)} className={botaoFraco}>
          Copiar
        </button>
      </div>
      <div className="mt-1 text-[var(--color-texto-fraco)]">Não fica salvo — copie agora.</div>
    </div>
  );
}
