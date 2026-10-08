import type { Cadastro } from "@/lib/apps";
import { campo } from "../_componentes/estilos";

const rotulo = "flex flex-col gap-1 text-xs text-[var(--color-texto-fraco)]";
const caixa = "flex items-start gap-2 text-sm";

const SITUACOES = [
  { valor: "no_ar", texto: "No ar" },
  { valor: "fora_do_ar", texto: "Fora do ar" },
  { valor: "planejado", texto: "Planejado (ainda não existe)" },
  { valor: "desativado", texto: "Desativado (some do login)" },
];

const PUBLICACOES = [
  { valor: "", texto: "Não informado" },
  { valor: "estatico", texto: "Site estático (pasta no servidor)" },
  { valor: "container", texto: "Container Docker" },
  { valor: "systemd", texto: "Serviço do sistema (systemd)" },
  { valor: "externo", texto: "Fora dos nossos servidores" },
];

/**
 * Campos do cadastro, iguais na criação e na edição. `c` nulo é cadastro novo:
 * nasce como aplicação com login e **restrita**, para que esquecer de
 * configurar feche o acesso em vez de abrir.
 */
export default function CamposAplicacao({ c }: { c: Cadastro | null }) {
  return (
    <>
      {c ? (
        <input type="hidden" name="id" value={c.id} />
      ) : (
        <label className={rotulo}>Identificador
          <input name="id" required pattern="[a-z0-9][a-z0-9-]*" className={campo} autoComplete="off" placeholder="ex.: loja-exemplo-com-br" />
          <span className="text-[11px]">Minúsculas, dígitos e hífen. É o que vai em <code>?app=</code> e não muda depois.</span>
        </label>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={rotulo}>Nome
          <input name="nome" required maxLength={80} defaultValue={c?.nome ?? ""} className={campo} autoComplete="off" /></label>
        <label className={rotulo}>Endereço
          <input name="host" required defaultValue={c?.host ?? ""} className={campo} autoComplete="off" placeholder="loja.exemplo.com.br" />
          <span className="text-[11px]">Só o domínio. É o único destino para onde a sessão pode ser mandada.</span>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={rotulo}>Tipo
          <select name="tipo" defaultValue={c?.tipo ?? "app"} className={campo}>
            <option value="app">Aplicação</option>
            <option value="site">Site (sem login)</option>
          </select></label>
        <label className={rotulo}>Situação
          <select name="situacao" defaultValue={c?.situacao ?? "planejado"} className={campo}>
            {SITUACOES.map((s) => <option key={s.valor} value={s.valor}>{s.texto}</option>)}
          </select></label>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-[var(--color-borda)] p-4">
        <legend className="px-1 text-xs font-semibold">Login único</legend>
        <label className={caixa}>
          <input type="checkbox" name="login" defaultChecked={c ? c.login : true} className="mt-1" />
          <span>Recebe sessão do login único
            <span className="block text-xs text-[var(--color-texto-fraco)]">Desmarcado, as opções abaixo não valem: ninguém entra por aqui.</span>
          </span>
        </label>
        <label className={rotulo}>Quem pode entrar
          <select name="papelExigido" defaultValue={c?.papelExigido ?? ""} className={campo}>
            <option value="">Equipe e clientes</option>
            <option value="ADMIN">Só a equipe da Avila Ops</option>
          </select></label>
        <label className={caixa}>
          <input type="checkbox" name="restrito" defaultChecked={c ? c.restrito : true} className="mt-1" />
          <span>Cliente só entra se for liberado na ficha da conta
            <span className="block text-xs text-[var(--color-texto-fraco)]">Desmarcado, qualquer conta de cliente entra.</span>
          </span>
        </label>
        <label className={caixa}>
          <input type="checkbox" name="exigeSegundoFator" defaultChecked={c?.exigeSegundoFator ?? false} className="mt-1" />
          <span>Exigir verificação em duas etapas de todo mundo, cliente inclusive</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={rotulo}>Deep link (app nativo)
            <input name="deepLink" defaultValue={c?.deepLink ?? ""} className={campo} autoComplete="off" placeholder="meuapp://auth/callback" /></label>
          <label className={rotulo}>Domínio Google Workspace
            <input name="dicaDominioGoogle" defaultValue={c?.dicaDominioGoogle ?? ""} className={campo} autoComplete="off" />
            <span className="text-[11px]">Só se o domínio for Workspace; senão o seletor do Google fica vazio.</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-[var(--color-borda)] p-4">
        <legend className="px-1 text-xs font-semibold">Onde roda</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={rotulo}>Repositório
            <input name="repositorio" defaultValue={c?.repositorio ?? ""} className={campo} autoComplete="off" placeholder="avilaops/nome-do-repositorio" /></label>
          <label className={rotulo}>Servidor
            <input name="servidor" maxLength={80} defaultValue={c?.servidor ?? ""} className={campo} autoComplete="off" placeholder="applications" /></label>
        </div>
        <label className={rotulo}>Publicação
          <select name="publicacao" defaultValue={c?.publicacao ?? ""} className={campo}>
            {PUBLICACOES.map((p) => <option key={p.valor} value={p.valor}>{p.texto}</option>)}
          </select></label>
        <label className={rotulo}>Observação
          <textarea name="observacao" rows={3} maxLength={500} defaultValue={c?.observacao ?? ""} className={campo} /></label>
      </fieldset>
    </>
  );
}
