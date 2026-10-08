"use client";

import CadastroSegundoFator from "@/components/CadastroSegundoFator";

/** O cadastro em si é compartilhado com `/conta`; aqui ele termina um login. */
export default function Cadastro() {
  return <CadastroSegundoFator aoConcluir={(destino) => window.location.assign(destino || "/")} />;
}
