"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import type { Resultado } from "../actions";
import { botaoFraco } from "./estilos";

type Acao = (estado: Resultado | null, fd: FormData) => Promise<Resultado>;

/**
 * Formulário genérico ligado a uma server action. Mostra o resultado embaixo;
 * quando a ação devolve um segredo (senha, link), exibe em destaque com botão
 * de copiar — é a única vez que ele aparece.
 *
 * O envio é feito à mão (`onSubmit`), e não pelo `action` do formulário, por
 * causa de um detalhe do React: formulário enviado por `action` é limpo ao
 * terminar, **inclusive quando a ação recusa**. A pessoa escolhia a empresa,
 * esquecia a confirmação, via o erro e o campo já tinha voltado ao valor
 * antigo; marcar a caixa e salvar de novo gravava "nada mudou". Agora o que
 * foi digitado fica na tela quando dá erro e só é limpo quando dá certo. O
 * `action` continua no formulário para o envio funcionar antes de o
 * JavaScript carregar.
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
  const [estado, dispatch, pendente] = useActionState(acao, null);
  const [, iniciar] = useTransition();
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado?.ok) formulario.current?.reset();
  }, [estado]);

  return (
    <form
      ref={formulario}
      action={dispatch}
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        iniciar(() => dispatch(dados));
      }}
      className={className ?? "flex flex-col gap-3"}
    >
      <fieldset disabled={pendente} className="contents">
        {children}
      </fieldset>
      {estado && !estado.ok && <p role="alert" className="text-xs text-red-400">{estado.erro}</p>}
      {estado?.ok && estado.mensagem && !estado.segredo && (
        <p className="text-xs text-emerald-400">{estado.mensagem}</p>
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
