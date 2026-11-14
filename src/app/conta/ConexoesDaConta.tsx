import type { ConexaoDaConta } from "@/lib/conexoesDaConta";
import PaginacaoConta from "@/app/conta/PaginacaoConta";
import RevogarConexao from "@/app/conta/RevogarConexao";

const operacoes: Record<string, string> = { read: "Ler", write: "Alterar", delete: "Excluir" };
export default function ConexoesDaConta({ conexoes, temMais, pagina, revogar }: {
  conexoes: ConexaoDaConta[]; temMais: boolean; pagina: number; revogar: (dados: FormData) => Promise<void>;
}) {
  return <section className="conta-cartao" aria-labelledby="conexoes-titulo">
    <h2 id="conexoes-titulo">Conexões que você autorizou</h2>
    <p className="conta-cartao-descricao">As permissões abaixo mostram o que você consentiu. O acesso aos dados é conferido a cada operação, conforme seus vínculos atuais.</p>
    {conexoes.length ? <ul className="conta-conexoes">{conexoes.map((c) => <li key={c.id}>
      <div><h3>{c.nome}</h3><p>{c.sistema} • {c.empresa}{c.unidade ? ` • ${c.unidade}` : ""}</p>
        <p>Permissões: {c.operacoes.map((o) => operacoes[o] ?? "Permissão não disponível").join(" • ")}</p>
        <p>Autorizada em {new Date(c.autorizadaEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
        {!c.integracaoAtiva && <p>Esta integração está desativada.</p>}
      </div><RevogarConexao id={c.id} nome={c.nome} revogar={revogar} />
    </li>)}</ul> : <div className="conta-vazio"><h3>Nenhuma conexão autorizada nesta página</h3><p>Quando você autorizar uma conexão, ela aparecerá aqui. Só autorize serviços que reconhece.</p></div>}
    <PaginacaoConta pagina={pagina} temMais={temMais} secao="conexoes" />
    <p className="conta-cartao-descricao">Revogar encerra o consentimento desta conexão e impede a renovação dos seus tokens. A revogação não sai da sua conta nem modifica suas empresas.</p>
  </section>;
}
