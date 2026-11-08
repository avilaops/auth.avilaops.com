"use client";
import { useState } from "react";
import type { ItemDoMenu } from "@/lib/menuDeApps";
import IconeConta from "@/app/conta/IconeConta";

const nomes = new Map<string, string>([["mail", "Mail"], ["crm", "CRM"], ["erp", "ERP"], ["lojas", "E-Commerce"], ["cms", "CMS"], ["tms", "TMS"]]);
const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Recebe somente destinos autorizados pelo servidor, via menuDeApps. */
export default function SistemasDaConta({ sistemas }: { sistemas: ItemDoMenu[] }) {
  const [busca, setBusca] = useState("");
  const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean);
  const visiveis = sistemas.filter((app) => termos.every((termo) => normalizar(`${nomes.get(app.id) ?? app.nome} ${app.url}`).includes(termo)));
  return (
    <section aria-labelledby="sistemas-titulo" className="conta-cartao conta-sistemas">
      <div className="conta-sistemas-cabecalho"><div><p className="conta-legenda">Seu ambiente de trabalho</p><h2 id="sistemas-titulo">
        {sistemas.length ? "Seus sistemas" : "Nenhum sistema disponível nesta conta"}
      </h2></div></div>
      {sistemas.length ? (
        <>
          <p className="conta-cartao-descricao">
            Escolha onde deseja trabalhar. A seleção da empresa acontece dentro de cada sistema.
          </p>
          <div className="conta-busca"><IconeConta id="busca" tamanho={19}/><input type="search" aria-label="Buscar sistemas" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar por nome ou domínio" autoComplete="off" />{busca && <button type="button" onClick={() => setBusca("")} aria-label="Limpar busca">×</button>}</div>
          <ul className="conta-sistemas-grade">
            {visiveis.map((app) => (
              <li key={app.id} className="min-w-0">
                <a
                  href={app.url}
                  aria-label={`Abrir ${nomes.get(app.id) ?? app.nome.replace(/[Áá]vila/g, "Avila")}`}
                  className="conta-sistema"
                >
                  <span className="conta-sistema-icone" aria-hidden="true"><IconeConta id={app.id} tamanho={24}/></span>
                  <span className="conta-sistema-nome">{nomes.get(app.id) ?? app.nome.replace(/[Áá]vila/g, "Avila")}</span>
                  <span className="conta-sistema-dominio">{new URL(app.url).host}</span>
                  <span className="conta-sistema-abrir">Abrir sistema <span aria-hidden="true">↗</span></span>
                </a>
              </li>
            ))}
          </ul>
          {visiveis.length === 0 && <div className="conta-busca-vazia"><IconeConta id="busca" tamanho={28}/><h3>Nenhum sistema encontrado</h3><p>Tente outro nome ou domínio.</p><button type="button" onClick={() => setBusca("")}>Limpar busca</button></div>}
          <p className="conta-aviso-acesso">
            Sua conta identifica você. O acesso aos dados de cada empresa depende do seu vínculo e das permissões nesse sistema.
          </p>
        </>
      ) : (
        <div className="mt-2 space-y-3 text-sm leading-relaxed text-[var(--color-texto-fraco)]">
          <p>Não há sistemas disponíveis para abrir com esta conta neste momento.</p>
          <p>
            Se você recebeu um convite, abra o link enviado ao seu e-mail. Se está aguardando
            acesso, confirme com quem administra a empresa qual conta deve usar.
          </p>
          <p>As solicitações de acesso e os convites são tratados fora desta tela.</p>
          <a href="/conta?secao=dados" className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-[var(--color-marca)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-marca)]">
            Conferir meus dados
          </a>
        </div>
      )}
    </section>
  );
}
