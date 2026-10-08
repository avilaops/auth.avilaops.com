import { buscarExclusao } from "@/lib/conexaoMeta";

export const dynamic = "force-dynamic";
export const metadata = { title: "Exclusão de dados" };

/**
 * Comprovante de exclusão de dados — a página que a Meta mostra a quem pediu.
 *
 * Pública de propósito: quem chega aqui acabou de remover o app e pode nem ter
 * mais como entrar. O código é aleatório e a página não revela de quem era.
 */
export default async function ExclusaoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const concluida = await buscarExclusao(codigo);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
          {concluida ? (
            <>
              <h1 className="text-base font-semibold">Dados excluídos</h1>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-texto-fraco)]">
                O pedido <code className="text-[var(--color-texto)]">{codigo}</code> foi concluído em{" "}
                {concluida.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short" })}.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--color-texto-fraco)]">
                Apagamos o que recebemos da Meta sobre você: o vínculo de login com Facebook, a autorização de acesso e a lista de Páginas,
                contas de anúncio, números de WhatsApp e catálogos.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-base font-semibold">Pedido não encontrado</h1>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-texto-fraco)]">Não há pedido de exclusão com este código.</p>
            </>
          )}
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-texto-fraco)]">
            A sua conta na Avila Ops continua existindo. Para excluí-la também, peça à equipe da Avila Ops pelo canal de atendimento que você já usa.
          </p>
        </div>
        <p className="mt-6 text-center text-xs text-[var(--color-texto-fraco)]">Avila Ops Tecnologia</p>
      </div>
    </main>
  );
}
