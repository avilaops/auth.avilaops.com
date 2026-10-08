import type { Role } from "@/lib/contas";

/**
 * Os quatro papéis da casa, em uma palavra cada:
 *
 * - `OWNER`  → **plataforma**: a Avila Ops. Uma conta só, a do Nicolas.
 * - `SOCIO`  → **sócio**: opera a Avila Ops junto com o dono, menos o caixa.
 *   Existe no app desde 04/09/2026 e só entrou aqui em 11/09, depois de uma
 *   semana trancando o Abraão fora (ver `papelValido` em lib/contas.ts).
 * - `ADMIN`  → **dono do negócio** que contrata (restaurante, loja, oficina).
 *   Manda na própria empresa e na equipe dela, em mais nada.
 * - `CLIENT` → **equipe** desse dono. Usa o que o produto oferece; não
 *   administra.
 *
 * Não são graus do mesmo papel: são pessoas diferentes, com telas diferentes.
 */
const ROTULO: Record<Role, { texto: string; classe: string }> = {
  OWNER: { texto: "plataforma", classe: "bg-[var(--color-marca)]/15 text-[var(--color-marca)]" },
  SOCIO: { texto: "sócio", classe: "bg-violet-500/15 text-violet-400" },
  ADMIN: { texto: "dono do negócio", classe: "bg-emerald-500/15 text-emerald-400" },
  CLIENT: { texto: "equipe do cliente", classe: "bg-sky-500/15 text-sky-400" },
};

export default function Papel({ role }: { role: Role }) {
  const { texto, classe } = ROTULO[role] ?? ROTULO.CLIENT;
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${classe}`}>{texto}</span>;
}
