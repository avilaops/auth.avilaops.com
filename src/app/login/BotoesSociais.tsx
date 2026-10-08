import IconeProvedor from "@/components/IconeProvedor";
import type { Provedor } from "@/lib/provedores";

/**
 * Botões dos conectores ligados. Server component: recebe a lista já
 * filtrada; o clique é um GET simples para `/api/auth/{provedor}`.
 */
export default function BotoesSociais({
  provedores,
  app,
  returnTo,
  vincular = false,
}: {
  provedores: Pick<Provedor, "id" | "nome" | "cor">[];
  app?: string | null;
  returnTo?: string | null;
  vincular?: boolean;
}) {
  if (provedores.length === 0) return null;

  const q = new URLSearchParams();
  if (app) q.set("app", app);
  if (returnTo) q.set("returnTo", returnTo);
  if (vincular) q.set("vincular", "1");
  const sufixo = q.toString() ? `?${q}` : "";

  return (
    <div className="flex flex-col gap-2">
      {provedores.map((p) => (
        <a
          key={p.id}
          href={`/api/auth/${p.id}${sufixo}`}
          className="flex items-center justify-center gap-2 rounded-lg border border-[var(--color-borda)] bg-[var(--color-fundo)] px-4 py-2.5 text-sm font-medium hover:border-[var(--color-texto-fraco)]"
        >
          <IconeProvedor id={p.id} tamanho={18} />
          {vincular ? `Vincular ${p.nome}` : `Continuar com ${p.nome}`}
        </a>
      ))}
    </div>
  );
}
