import Link from "next/link";
import type { VinculoDaConta } from "@/lib/acessosDaConta";

const papeis: Record<string, string> = { ADMINISTRADOR: "Administrador", COMPRADOR: "Comprador", APROVADOR: "Aprovador", FINANCEIRO: "Financeiro", VENDEDOR: "Vendedor" };
const situacoes: Record<VinculoDaConta["situacao"], string> = {
  ATIVO: "Vínculo ativo", SUSPENSO: "Vínculo suspenso", REVOGADO: "Vínculo removido", SEM_AUTORIZACAO: "Sem permissões ativas",
};

export default function AcessosDaConta({ emailVerificado, vinculos, temMais }: { emailVerificado: boolean; vinculos: VinculoDaConta[]; temMais: boolean }) {
  return (
    <section className="conta-cartao" aria-labelledby="acessos-titulo">
      <h2 id="acessos-titulo">Sua identidade e suas empresas</h2>
      <p className="conta-cartao-descricao">{emailVerificado ? "E-mail confirmado." : "E-mail ainda não confirmado. Confira a situação em Segurança da conta."} Ter uma conta não concede acesso automático a uma empresa.</p>
      {vinculos.length ? (
        <ul className="conta-vinculos">
          {vinculos.map((v) => <li key={v.id}>
            <strong>{v.empresa}</strong><span>{v.sistema}</span>
            <p>{situacoes[v.situacao]} · {v.acessoAoSistema ? "Sistema autorizado para esta conta" : "Sistema sem acesso nesta conta"}</p>
            {v.situacao === "ATIVO" && v.papeis.map((p, i) => <p key={i}>{papeis[p.papel] ?? p.papel}{p.unidade ? ` · ${p.unidade}` : " · Empresa inteira"}</p>)}
            {(v.situacao !== "ATIVO" || !v.acessoAoSistema) && <p>Fale com quem administra a empresa para conferir seu acesso.</p>}
          </li>)}
        </ul>
      ) : <p className="conta-cartao-descricao">Nenhum vínculo de empresa registrado no Auth para esta conta. Os vínculos mantidos pelo produto são conferidos ao abrir o sistema. Se você recebeu um convite, abra o link enviado ao seu e-mail e confira qual conta foi convidada.</p>}
      {temMais && <p className="conta-cartao-descricao">Exibindo os primeiros 50 vínculos. Consulte os demais no sistema correspondente.</p>}
      <p className="conta-cartao-descricao">A empresa é selecionada dentro de cada sistema. E-mail ou CNPJ coincidentes não concedem vínculo nem alteram seu papel.</p>
      <Link className="conta-botao" href="/sair">Trocar de conta</Link>
    </section>
  );
}
