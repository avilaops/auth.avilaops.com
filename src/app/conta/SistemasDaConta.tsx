import type { ItemDoMenu } from "@/lib/menuDeApps";

/** Recebe somente destinos autorizados pelo servidor, via menuDeApps. */
export default function SistemasDaConta({ sistemas }: { sistemas: ItemDoMenu[] }) {
  return (
    <section aria-labelledby="sistemas-titulo" className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-4 sm:p-6">
      <h2 id="sistemas-titulo" className="text-lg font-semibold">
        {sistemas.length ? "Seus sistemas" : "Nenhum sistema disponível nesta conta"}
      </h2>
      {sistemas.length ? (
        <>
          <p className="mb-4 mt-2 text-sm leading-relaxed text-[var(--color-texto-fraco)]">
            Escolha um sistema para continuar. Ao entrar, você poderá selecionar uma empresa
            autorizada ou seguir as opções de cadastro disponíveis no sistema.
          </p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {sistemas.map((app) => (
              <li key={app.id} className="min-w-0">
                <a
                  href={app.url}
                  className="flex min-h-11 h-full items-center justify-between gap-3 rounded-xl border border-[var(--color-borda)] bg-[var(--color-fundo)] px-4 py-3 hover:border-[var(--color-texto-fraco)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-marca)]"
                >
                  <span className="min-w-0 break-words">
                    <span className="block text-sm font-semibold">Abrir {app.nome}</span>
                    <span className="mt-1 block break-all text-xs text-[var(--color-texto-fraco)]">{new URL(app.url).host}</span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-[var(--color-texto-fraco)]">→</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-[var(--color-texto-fraco)]">
            Sua conta identifica você. O acesso aos dados de cada empresa depende do seu vínculo e das permissões nesse sistema.
          </p>
        </>
      ) : (
        <div className="mt-2 space-y-3 text-sm leading-relaxed text-[var(--color-texto-fraco)]">
          <p>Não há sistemas disponíveis para abrir com esta conta neste momento.</p>
          <p>
            Se você recebeu um convite, abra o link enviado ao seu e-mail. Se está aguardando
            acesso, confirme com quem administra a empresa qual conta deve usar.
          </p>
          <p>As solicitações de acesso e os convites são tratados fora desta tela.</p>
          <a href="/conta?secao=dados" className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-[var(--color-marca)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-marca)]">
            Conferir meus dados
          </a>
        </div>
      )}
    </section>
  );
}
