/*
 * O símbolo da Ávila Ops.
 *
 * É o mesmo arquivo que o painel usa (`public/marca/simbolo-*.png`), copiado
 * para cá para as duas telas mostrarem exatamente o mesmo desenho. Antes disto
 * a tela de entrada tinha só a letra "A" dentro de um quadrado, que não é a
 * marca: o símbolo é o A formado pelo triângulo azul, a barra vermelha e o
 * arco amarelo.
 *
 * `<img>` e não `next/image` de propósito: o build sai em `output: "standalone"`
 * e o otimizador de imagem exige o sharp dentro da imagem final. Para um PNG
 * pequeno e fixo isso é dependência sem retorno. `width`/`height` explícitos
 * reservam o espaço, então também não há salto de layout.
 */

type Props = {
  /** Lado do símbolo em pixels. 48 na tela de entrada, 32 na barra do admin. */
  tamanho?: number;
  className?: string;
};

export default function Marca({ tamanho = 48, className }: Props) {
  // O arquivo de 128px cobre bem telas retina nos dois tamanhos que usamos.
  return (
    <img
      src="/marca/simbolo-128.png"
      alt="Ávila Ops"
      width={tamanho}
      height={tamanho}
      className={className}
      style={{ width: tamanho, height: tamanho }}
    />
  );
}
