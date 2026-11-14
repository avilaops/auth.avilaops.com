import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Compatibilidade com links antigos e com a confirmação de saída. */
export default function Conexoes() {
  redirect("/conta?secao=conexoes");
}

