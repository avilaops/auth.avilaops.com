import { redirect } from "next/navigation";
import { lerDesafio } from "@/lib/desafio";
import FormDesafio from "./FormDesafio";
import Moldura from "./Moldura";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verificação em duas etapas" };

/**
 * Segunda etapa do login. Só existe com o bilhete de desafio no cookie — sem
 * ele não há o que verificar, e a pessoa volta à senha.
 */
export default async function MfaPage() {
  const desafio = await lerDesafio();
  if (!desafio) redirect("/login");
  if (desafio.motivo === "cadastrar") redirect("/mfa/cadastrar");

  return (
    <Moldura titulo="Verificação em duas etapas" subtitulo={desafio.email}>
      <FormDesafio email={desafio.email} appId={desafio.appId} />
    </Moldura>
  );
}
