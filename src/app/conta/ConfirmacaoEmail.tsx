"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ConfirmacaoEmail({ email, confirmado, disponivel }: { email: string; confirmado: boolean; disponivel: boolean }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  async function solicitar() {
    setEnviando(true); setErro(""); setMensagem("");
    try {
      const res = await fetch("/api/conta/email/solicitar", { method: "POST" });
      const dados = await res.json();
      if (!res.ok) { setErro(dados.erro || "Não foi possível enviar o link."); return; }
      setMensagem(dados.mensagem);
      if (dados.confirmado) router.refresh();
    } catch { setErro("Falha de conexão. Tente novamente."); }
    finally { setEnviando(false); }
  }
  return <section className="conta-cartao" aria-labelledby="email-confirmacao-titulo">
    <h2 id="email-confirmacao-titulo">Confirmação do e-mail</h2>
    <p className="conta-cartao-descricao">{email}</p>
    <p className={`conta-estado ${confirmado ? "conta-estado-ok" : ""}`}>{confirmado ? "E-mail confirmado" : "E-mail ainda não confirmado"}</p>
    <p className="conta-cartao-descricao">{confirmado ? "Você confirmou que tem acesso ao endereço usado nesta conta." : "Receba um link no endereço da conta para confirmar que ele é seu. A confirmação não altera sua senha nem ativa um segundo fator."}</p>
    {!confirmado && (disponivel
      ? <button className="perfil-salvar" type="button" onClick={solicitar} disabled={enviando}>{enviando ? "Enviando..." : mensagem ? "Reenviar link de confirmação" : "Enviar link de confirmação"}</button>
      : <p className="conta-cartao-descricao">O envio de confirmação está indisponível neste ambiente. Tente novamente mais tarde ou fale com a equipe Avila Ops.</p>)}
    {mensagem && <p className="conta-retorno" role="status">{mensagem}</p>}
    {erro && <p className="conta-retorno perfil-erro" role="alert">{erro}</p>}
  </section>;
}
