"use client";
import { useFormStatus } from "react-dom";

function Botao() {
  const { pending } = useFormStatus();
  return <button type="submit" className="conta-botao conta-botao-perigo" disabled={pending}>{pending ? "Revogando..." : "Revogar conexão"}</button>;
}
export default function RevogarConexao({ id, nome, revogar }: { id: string; nome: string; revogar: (dados: FormData) => Promise<void> }) {
  return <form action={revogar} onSubmit={(event) => {
    if (!window.confirm(`Revogar a conexão ${nome}? Ela perderá acesso na próxima operação e precisará de uma nova autorização.`)) event.preventDefault();
  }}><input type="hidden" name="id" value={id} /><Botao /></form>;
}
