import Link from "next/link";
import type { SecaoDaConta } from "@/lib/secoesDaConta";

export default function PaginacaoConta({ pagina, temMais, secao }: { pagina: number; temMais: boolean; secao: SecaoDaConta }) {
  if (pagina === 1 && !temMais) return null;
  return <nav className="conta-paginacao" aria-label="Paginação">
    {pagina > 1 && <Link className="conta-botao" href={`/conta?secao=${secao}&pagina=${pagina - 1}`}>Página anterior</Link>}
    <span>Página {pagina}</span>
    {temMais && <Link className="conta-botao" href={`/conta?secao=${secao}&pagina=${pagina + 1}`}>Próxima página</Link>}
  </nav>;
}
