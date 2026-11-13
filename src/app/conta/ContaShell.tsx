import Link from "next/link";
import Image from "next/image";
import Marca from "@/components/Marca";
import ControleTema from "@/components/ControleTema";
import IconeConta from "@/app/conta/IconeConta";
import { enderecoDaSecao, SECOES_DA_CONTA, type SecaoDaConta } from "@/lib/secoesDaConta";

type Props = {
  nome: string;
  email: string;
  equipe: boolean;
  painel: boolean;
  secao: SecaoDaConta;
  children: React.ReactNode;
  foto?: string | null;
};

export default function ContaShell({ nome, email, equipe, painel, secao, children, foto = null }: Props) {
  const iniciais = nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]).join("") || "A";
  return (
    <main className="conta-portal">
      <a className="conta-pular" href="#conta-conteudo">Pular para o conteúdo</a>
      <header className="conta-barra">
        <Link href="/conta" className="conta-marca" aria-label="Avila Ops, Minha conta">
          <Marca tamanho={32} /><span>Avila<span className="conta-marca-leve"> Ops</span></span>
        </Link>
        <span className="conta-barra-contexto">Minha conta</span>
        <div className="conta-acoes">
          <ControleTema />
          {painel && <Link href="/admin" className="conta-botao">Painel <span aria-hidden="true">↗</span></Link>}
          <form action="/api/auth/logout" method="post"><button type="submit" className="conta-botao">Sair <span aria-hidden="true">↗</span></button></form>
        </div>
      </header>
      <div className="conta-estrutura">
        <aside className="conta-lateral">
          <p className="conta-legenda">Sua conta</p>
          <nav aria-label="Seções da conta" className="conta-navegacao">
            {SECOES_DA_CONTA.map((item) => <Link key={item.id} href={enderecoDaSecao(item.id)} aria-current={item.id === secao ? "page" : undefined}>
              <span className="conta-nav-icone" aria-hidden="true"><IconeConta id={item.id} tamanho={20}/></span>{item.rotulo}
            </Link>)}
            <Link href="/conta/threads"><span className="conta-nav-icone" aria-hidden="true"><IconeConta id="threads" tamanho={20}/></span>Threads</Link>
          </nav>
          <div className="conta-ajuda"><p>Uma conta, seus sistemas.</p><span>O acesso a cada empresa é definido pelas permissões no sistema.</span></div>
          <a className="conta-voltar-site" href="https://avilaops.com">Conhecer a Avila Ops <span aria-hidden="true">↗</span></a>
        </aside>
        <div className="conta-conteudo" id="conta-conteudo" tabIndex={-1}>
          <header className="conta-boas-vindas">
            <div>
              <p className="conta-legenda">Seu espaço Avila Ops</p>
              <h1>{secao === "inicio" ? `Olá, ${nome.trim().split(/\s+/)[0] || "bem-vindo"}.` : secao === "dados" ? "Meus dados" : "Segurança da conta"}</h1>
              <p className="conta-introducao">{secao === "inicio" ? "Acesse os sistemas disponíveis para sua conta." : secao === "dados" ? "Mantenha suas informações de contato atualizadas." : "Gerencie suas formas de entrar e a verificação em duas etapas."}</p>
            </div>
            <div className="conta-identidade"><span className="conta-avatar" aria-hidden="true">{foto ? <Image src={foto} alt="" width={40} height={40} unoptimized /> : iniciais}</span><div><strong>{nome}</strong><span className="conta-email">{email}</span><span className="conta-papel">{equipe ? "Equipe Avila Ops" : "Cliente"}</span><Link className="conta-editar-perfil" href={enderecoDaSecao("dados")}>Editar perfil ↗</Link></div></div>
          </header>
          <div className="conta-paineis">{children}</div>
          <footer className="conta-rodape"><span>Avila Ops</span><span>Uma conta para conectar sua operação.</span></footer>
        </div>
      </div>
    </main>
  );
}
