/**
 * Aviso ao lado do seletor de domínio da caixa.
 *
 * A lista vem dos domínios ativos no Avila Mail (`dominiosHospedados`). Domínio
 * comprado e ainda não cadastrado lá simplesmente não aparece, e a tela não
 * dizia por quê nem onde resolver.
 */
export default function OndeCadastrarDominio() {
  return (
    <p className="text-xs text-[var(--color-texto-fraco)]">
      Só aparecem os domínios ativos no Avila Mail. Domínio novo é cadastrado e verificado em{" "}
      <a href="https://mail.avilaops.com/admin" target="_blank" rel="noreferrer" className="text-[var(--color-marca)] hover:underline">
        mail.avilaops.com/admin
      </a>
      ; depois de ativo, ele entra nesta lista sozinho.
    </p>
  );
}
