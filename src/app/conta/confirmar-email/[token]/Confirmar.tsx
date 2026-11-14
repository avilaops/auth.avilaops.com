"use client";
import { useState } from "react";
import Link from "next/link";

export default function Confirmar({ token, estado }: { token: string; estado: "valido" | "usado" | "invalido" }) {
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(estado === "usado");
  const [erro, setErro] = useState("");
  async function confirmar() {
    setEnviando(true); setErro("");
    try {
      const resposta = await fetch("/api/conta/email/confirmar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const dados = await resposta.json();
      if (!resposta.ok) { setErro(dados.erro || "Não foi possível confirmar."); return; }
      setConcluido(true);
    } catch { setErro("Falha de conexão. Tente novamente."); }
    finally { setEnviando(false); }
  }
  return <>
    {concluido ? <p role="status">E-mail confirmado. Sua senha e a verificação em duas etapas continuam as mesmas.</p>
      : estado === "invalido" ? <p>Este link expirou ou não corresponde mais ao endereço atual. Entre na segurança da sua conta para pedir outro.</p>
      : <><p>Confirme que você tem acesso ao endereço que recebeu esta mensagem.</p><button className="perfil-salvar" onClick={confirmar} disabled={enviando}>{enviando ? "Confirmando..." : "Confirmar meu e-mail"}</button></>}
    {erro && <p className="perfil-erro conta-retorno" role="alert">{erro}</p>}
    <Link className="conta-botao conta-retorno" href="/conta?secao=seguranca">Ir para a segurança da conta</Link>
  </>;
}
