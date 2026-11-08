"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useFormStatus } from "react-dom";

type Props = {
  nome: string; email: string; telefone: string; foto: string | null;
  salvarDados: (form: FormData) => Promise<void>;
  salvarFoto: (form: FormData) => Promise<void>;
  demonstracao?: boolean;
};
function Enviar({ children, disabled = false }: { children: React.ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button className="perfil-salvar" type="submit" disabled={disabled || pending}>{pending ? "Salvando..." : children}</button>;
}
export default function PerfilForm({ nome, email, telefone, foto, salvarDados, salvarFoto, demonstracao = false }: Props) {
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const objectUrl = useRef<string | null>(null);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  const iniciais = nome.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0]).join("");
  return <div className="perfil-editor">
    <section className="perfil-foto-bloco" aria-labelledby="perfil-foto-titulo">
      <div><h3 id="perfil-foto-titulo">Foto do perfil</h3><p>Uma foto para identificar sua conta.</p></div>
      <div className="perfil-foto-linha">
        <div className="perfil-foto-preview">{selecionada || foto ? <Image src={selecionada ?? foto!} alt="Sua foto do perfil" width={96} height={96} unoptimized /> : <span aria-hidden="true">{iniciais || "A"}</span>}</div>
        <form action={salvarFoto} className="perfil-foto-form">
          <label className="perfil-escolher">Escolher foto<input type="file" name="foto" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
            const arquivo = event.target.files?.[0];
            if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
            objectUrl.current = null; setSelecionada(null); setErro("");
            if (!arquivo) return;
            if (!["image/jpeg", "image/png", "image/webp"].includes(arquivo.type) || arquivo.size > 2 * 1024 * 1024) { event.target.value = ""; setErro("Escolha uma foto JPG, PNG ou WebP de até 2 MB."); return; }
            objectUrl.current = URL.createObjectURL(arquivo); setSelecionada(objectUrl.current);
          }} /></label>
          <p>JPG, PNG ou WebP. Até 2 MB.</p>
          <Enviar disabled={!selecionada || demonstracao}>Salvar foto</Enviar>
        </form>
        {foto && <form action={salvarFoto}><input type="hidden" name="remover" value="1"/><Enviar disabled={demonstracao}>Remover foto</Enviar></form>}
      </div>
      {erro && <p className="perfil-erro" role="alert">{erro}</p>}
    </section>
    <form action={salvarDados} className="perfil-dados-form">
      <div><h3>Informações pessoais</h3><p>Atualize o nome e o telefone usados na sua conta.</p></div>
      <label>Nome completo<input name="nome" defaultValue={nome} required maxLength={120} autoComplete="name" /></label>
      <label>Telefone <span>(opcional)</span><input name="telefone" defaultValue={telefone} maxLength={30} autoComplete="tel" type="tel" placeholder="(00) 00000-0000" /></label>
      <label>E-mail<input value={email} readOnly type="email" autoComplete="email" aria-describedby="perfil-email-ajuda" /></label>
      <p id="perfil-email-ajuda">O e-mail identifica seu acesso e não pode ser alterado por este formulário.</p>
      <Enviar disabled={demonstracao}>Salvar alterações</Enviar>
    </form>
    {demonstracao && <p className="perfil-demonstracao">Prévia com dados fictícios. O salvamento fica disponível na conta autenticada.</p>}
  </div>;
}
