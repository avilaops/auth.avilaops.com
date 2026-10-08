import { redirect } from "next/navigation";
import { lerDesafio } from "@/lib/desafio";
import Moldura from "../Moldura";
import Cadastro from "./Cadastro";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ativar verificação em duas etapas" };

/**
 * Cadastro obrigatório, no meio do login: a conta é da equipe (ou o app exige)
 * e ainda não tem fator. Acontece aqui, antes de existir sessão — deixar para
 * depois seria o mesmo que não exigir, porque bastaria nunca voltar à tela.
 */
export default async function CadastrarMfaPage() {
  const desafio = await lerDesafio();
  if (!desafio) redirect("/login");
  if (desafio.motivo !== "cadastrar") redirect("/mfa");

  return (
    <Moldura titulo="Ative a verificação em duas etapas" subtitulo={desafio.email}>
      <p className="mb-5 text-xs leading-relaxed text-[var(--color-texto-fraco)]">
        Contas com acesso aos sistemas da Avila Ops precisam de um segundo fator. Leva um minuto
        e vale para todos os sistemas de uma vez.
      </p>
      <Cadastro />
    </Moldura>
  );
}
