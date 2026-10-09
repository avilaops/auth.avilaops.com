import Link from "next/link";
import { redirect } from "next/navigation";
import IconeProvedor from "@/components/IconeProvedor";
import { appMeta, buscarConexao, type AtivoTela } from "@/lib/conexaoMeta";
import { ESCOPOS_CONHECIDOS, type TipoAtivo } from "@/lib/meta";
import { lerSessao } from "@/lib/sessao";
import { acaoDesconectarMeta, acaoSincronizarMeta } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conexão com a Meta" };

const GRUPOS: { tipo: TipoAtivo; titulo: string; vazio: string }[] = [
  { tipo: "pagina", titulo: "Páginas do Facebook", vazio: "Nenhuma Página nesta conta." },
  { tipo: "instagram", titulo: "Contas do Instagram", vazio: "Nenhum Instagram profissional ligado às suas Páginas." },
  { tipo: "whatsapp", titulo: "WhatsApp Business", vazio: "Nenhuma conta do WhatsApp Business nos seus negócios." },
  { tipo: "conta_anuncio", titulo: "Contas de anúncio", vazio: "Nenhuma conta de anúncio." },
  { tipo: "catalogo", titulo: "Catálogos de produtos", vazio: "Nenhum catálogo nos seus negócios." },
  { tipo: "negocio", titulo: "Negócios (Business Manager)", vazio: "Você não participa de nenhum negócio." },
];

/** Permissão que precisa ter sido concedida para o grupo aparecer. */
const EXIGE: Record<TipoAtivo, string[]> = {
  pagina: ["pages_show_list"],
  instagram: ["pages_show_list", "instagram_basic"],
  whatsapp: ["business_management", "whatsapp_business_management"],
  conta_anuncio: ["ads_read"],
  catalogo: ["business_management", "catalog_management"],
  negocio: ["business_management"],
};

const AVISOS: Record<string, { texto: string; erro?: boolean }> = {
  conectado: { texto: "Conta conectada. Estes são os ativos que você autorizou." },
  atualizado: { texto: "Lista atualizada com o que está na Meta agora." },
  desconectado: { texto: "Conexão removida. O acesso foi revogado e os dados foram apagados daqui." },
  cancelado: { texto: "Você cancelou a autorização. Nada foi conectado.", erro: true },
  falhou: { texto: "Não foi possível falar com a Meta. Se a autorização venceu, conecte de novo.", erro: true },
};

function data(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

function resumo(a: AtivoTela): string {
  const d = a.detalhe;
  const partes: string[] = [];
  if (a.tipo === "pagina") {
    if (d.categoria) partes.push(String(d.categoria));
    if (typeof d.seguidores === "number") partes.push(`${d.seguidores.toLocaleString("pt-BR")} seguidores`);
  } else if (a.tipo === "instagram") {
    if (d.pagina) partes.push(`Página ${d.pagina}`);
  } else if (a.tipo === "whatsapp") {
    if (d.numeros) partes.push(String(d.numeros));
    if (d.negocio) partes.push(String(d.negocio));
  } else if (a.tipo === "conta_anuncio") {
    if (d.moeda) partes.push(String(d.moeda));
    partes.push(d.ativa ? "ativa" : "inativa");
  } else if (a.tipo === "catalogo") {
    if (typeof d.produtos === "number") partes.push(`${d.produtos.toLocaleString("pt-BR")} produtos`);
    if (d.negocio) partes.push(String(d.negocio));
  } else if (a.tipo === "negocio") {
    if (d.verificacao) partes.push(d.verificacao === "verified" ? "verificado" : "não verificado");
  }
  return partes.join(" · ");
}

/**
 * Conexão da conta com a Meta.
 *
 * A pessoa autoriza uma vez aqui e os sistemas da casa (atendimento, loja,
 * anúncios) passam a enxergar as Páginas, números e catálogos dela. A tela
 * mostra exatamente o que foi autorizado e deixa desligar tudo com um clique.
 */
export default async function ContaMetaPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login?returnTo=/conta/meta");
  const { aviso } = await searchParams;

  const [app, conexao] = await Promise.all([appMeta(), buscarConexao(sessao.sub)]);
  const mensagem = aviso ? AVISOS[aviso] : undefined;
  const indisponivel = !app || conexao === "indisponivel";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <Link href="/conta" className="text-xs text-[var(--color-texto-fraco)] hover:text-[var(--color-texto)]">← Minha conta</Link>
      <header className="mb-6 mt-2 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--color-borda)] bg-[var(--color-cartao)]">
          <IconeProvedor id="facebook" tamanho={24} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Facebook, Instagram e WhatsApp</h1>
          <p className="text-sm text-[var(--color-texto-fraco)]">Conecte sua conta da Meta para os sistemas da Avila Ops trabalharem com as suas Páginas e números.</p>
        </div>
      </header>

      {mensagem && (
        <p
          role={mensagem.erro ? "alert" : "status"}
          className={`mb-6 rounded-lg border p-3 text-xs ${mensagem.erro ? "border-[var(--color-marca-vermelho)]/40 bg-[var(--marca-vermelho-suave)] text-[var(--color-marca-vermelho)]" : "border-[var(--color-borda)] bg-[var(--color-cartao)]"}`}
        >
          {mensagem.texto}
        </p>
      )}

      {indisponivel ? (
        <Cartao titulo="Conexão indisponível">
          <p className="text-sm text-[var(--color-texto-fraco)]">A conexão com a Meta ainda não foi configurada. Fale com a equipe da Avila Ops.</p>
        </Cartao>
      ) : !conexao ? (
        <Cartao titulo="Nenhuma conta conectada">
          <p className="text-sm leading-relaxed text-[var(--color-texto-fraco)]">
            Você será levado ao Facebook para escolher o que autorizar. A Avila Ops só enxerga o que você marcar lá, e você pode desconectar quando quiser.
          </p>
          <ul className="mt-4 flex flex-col gap-1.5 text-xs text-[var(--color-texto-fraco)]">
            {app.escopos.filter((e) => ESCOPOS_CONHECIDOS[e]).map((e) => (
              <li key={e} className="flex gap-2">
                <span aria-hidden>•</span>
                <span>{ESCOPOS_CONHECIDOS[e]}</span>
              </li>
            ))}
          </ul>
          <a
            href="/api/meta/conectar"
            className="mt-5 inline-block rounded-lg bg-[var(--color-marca-solida)] px-4 py-2 text-sm font-semibold text-[var(--color-marca-contraste)] hover:opacity-90"
          >
            Conectar com o Facebook
          </a>
        </Cartao>
      ) : (
        <div className="flex flex-col gap-6">
          <Cartao titulo={conexao.nome ? `Conectado como ${conexao.nome}` : "Conta conectada"}>
            <dl className="grid gap-x-6 gap-y-1 text-xs text-[var(--color-texto-fraco)] sm:grid-cols-2">
              <div>Conectado em {data(conexao.criadoEm)}</div>
              {conexao.sincronizadoEm && <div>Atualizado em {data(conexao.sincronizadoEm)}</div>}
              {conexao.expiraEm && (
                <div className={conexao.expirada ? "text-[var(--color-marca-vermelho)]" : ""}>
                  {conexao.expirada ? "Autorização vencida em " : "Autorização válida até "}
                  {data(conexao.expiraEm)}
                </div>
              )}
            </dl>
            {conexao.expirada && (
              <p role="alert" className="mt-3 text-xs text-[var(--color-marca-vermelho)]">A autorização venceu. Conecte de novo para os sistemas voltarem a funcionar.</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <form action={acaoSincronizarMeta}>
                <button className="rounded-lg border border-[var(--color-borda)] px-3 py-1.5 text-xs hover:bg-[var(--color-fundo)]">Atualizar lista</button>
              </form>
              <a href="/api/meta/conectar" className="rounded-lg border border-[var(--color-borda)] px-3 py-1.5 text-xs hover:bg-[var(--color-fundo)]">
                Rever permissões no Facebook
              </a>
              <form action={acaoDesconectarMeta}>
                <button className="rounded-lg border border-[var(--color-borda)] px-3 py-1.5 text-xs text-[var(--color-marca-vermelho)] hover:bg-[var(--color-fundo)]">Desconectar</button>
              </form>
            </div>
          </Cartao>

          <Cartao titulo="O que você autorizou">
            <ul className="flex flex-col gap-1.5 text-xs">
              {conexao.escopos.map((e) => (
                <li key={e} className="flex items-baseline justify-between gap-3">
                  <span>{ESCOPOS_CONHECIDOS[e] ?? e}</span>
                  <code className="shrink-0 text-[11px] text-[var(--color-texto-fraco)]">{e}</code>
                </li>
              ))}
              {conexao.recusados.map((e) => (
                <li key={e} className="flex items-baseline justify-between gap-3 text-[var(--color-texto-fraco)] line-through">
                  <span>{ESCOPOS_CONHECIDOS[e] ?? e}</span>
                  <code className="shrink-0 text-[11px]">{e}</code>
                </li>
              ))}
            </ul>
          </Cartao>

          {GRUPOS.filter((g) => EXIGE[g.tipo].every((e) => conexao.escopos.includes(e))).map((g) => {
            const itens = conexao.ativos.filter((a) => a.tipo === g.tipo);
            return (
              <Cartao key={g.tipo} titulo={`${g.titulo} (${itens.length})`}>
                {itens.length === 0 ? (
                  <p className="text-xs text-[var(--color-texto-fraco)]">{g.vazio}</p>
                ) : (
                  <ul className="divide-y divide-[var(--color-borda)]">
                    {itens.map((a) => (
                      <li key={a.externoId} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm">{a.nome}</div>
                          <div className="truncate text-xs text-[var(--color-texto-fraco)]">{resumo(a)}</div>
                        </div>
                        <code className="shrink-0 text-[11px] text-[var(--color-texto-fraco)]">{a.externoId}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </Cartao>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-xs leading-relaxed text-[var(--color-texto-fraco)]">
        Desconectar revoga o acesso na Meta e apaga daqui a autorização e a lista de ativos. Você também pode remover o app em
        Facebook → Configurações → Apps e sites; o efeito aqui é o mesmo.
      </p>
    </main>
  );
}

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--color-borda)] bg-[var(--color-cartao)] p-6">
      <h2 className="mb-3 text-sm font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}
