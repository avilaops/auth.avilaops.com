import type { Metadata } from "next";
import Marca from "@/components/Marca";
import { estadoConfirmacaoEmail } from "@/lib/confirmacaoEmail";
import Confirmar from "./Confirmar";
import "../../conta.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirmar e-mail", referrer: "same-origin", robots: { index: false } };

export default async function ConfirmarEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const estado = await estadoConfirmacaoEmail(token);
  return <main className="conta-confirmar"><div className="conta-cartao">
    <Marca tamanho={48} /><p className="conta-legenda">Conta • Avila Ops</p><h1>Confirme seu e-mail</h1>
    <Confirmar token={token} estado={estado} />
  </div></main>;
}
