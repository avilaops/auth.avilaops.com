import Link from "next/link";
import IconeConta from "@/app/conta/IconeConta";

export default function ResumoDaConta({ emailVerificado, autenticadorAtivo }: { emailVerificado: boolean; autenticadorAtivo: boolean }) {
  const atalhos = [
    { id: "dados", titulo: "Seu perfil", descricao: "Atualize nome, telefone e foto.", estado: "Conferir meus dados" },
    { id: "seguranca", titulo: "Sua segurança", descricao: `${emailVerificado ? "E-mail confirmado" : "E-mail pendente de confirmação"} • ${autenticadorAtivo ? "Autenticador ativo" : "Autenticador não cadastrado"}`, estado: "Gerenciar segurança" },
    { id: "empresas", titulo: "Suas empresas", descricao: "Consulte vínculos, unidades e papéis registrados para sua conta.", estado: "Conferir meus acessos" },
    { id: "conexoes", titulo: "Suas conexões", descricao: "Veja o que você autorizou e revogue conexões que não usa mais.", estado: "Gerenciar conexões" },
  ];
  return <section aria-labelledby="conta-atalhos-titulo" className="conta-atalhos">
    <div><p className="conta-legenda">Cuide da sua conta</p><h2 id="conta-atalhos-titulo">Tudo no seu lugar</h2></div>
    <div className="conta-atalhos-grade">{atalhos.map((a) => <Link href={`/conta?secao=${a.id}`} key={a.id} className="conta-cartao conta-atalho">
      <span className="conta-atalho-icone"><IconeConta id={a.id} /></span><h3>{a.titulo}</h3><p>{a.descricao}</p><span className="conta-atalho-acao">{a.estado} <span aria-hidden="true">↗</span></span>
    </Link>)}</div>
  </section>;
}
