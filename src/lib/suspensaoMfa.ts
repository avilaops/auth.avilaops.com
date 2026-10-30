import type { Papel } from "@/lib/apps";

type Suspensao = { email: string; inicio: string; fim: string; motivo: string };

/** Exceção operacional explícita, limitada a uma conta ADMIN e a 24 horas. */
export function suspensaoMfaAtiva(
  pessoa: { email: string; papel: Papel },
  agora = Date.now(),
  configuracao = process.env.MFA_SUSPENSAO_TEMPORARIA,
): Suspensao | null {
  if (!configuracao || configuracao.length > 1024 || pessoa.papel !== "ADMIN" || !Number.isFinite(agora)) return null;
  try {
    const valor: unknown = JSON.parse(configuracao);
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
    const dados = valor as Record<string, unknown>;
    if (Object.keys(dados).sort().join(",") !== "email,fim,inicio,motivo") return null;
    if (![dados.email, dados.inicio, dados.fim, dados.motivo].every(campo => typeof campo === "string")) return null;
    const suspensao = dados as Suspensao;
    if (!/^[^@\s*?]+@[^@\s*?]+\.[^@\s*?]+$/.test(suspensao.email)) return null;
    if (suspensao.email.trim().toLowerCase() !== pessoa.email.trim().toLowerCase()) return null;
    if (!suspensao.motivo.trim() || suspensao.motivo.length > 200 || /[\x00-\x1f\x7f]/.test(suspensao.motivo)) return null;
    const instante = (texto: string): number | null => {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(texto)) return null;
      const tempo = Date.parse(texto);
      if (!Number.isFinite(tempo) || new Date(tempo).toISOString().replace(".000Z", "Z") !== texto.replace(".000Z", "Z")) return null;
      return tempo;
    };
    const inicio = instante(suspensao.inicio);
    const fim = instante(suspensao.fim);
    if (inicio === null || fim === null || fim <= inicio || fim - inicio > 24 * 60 * 60 * 1000) return null;
    if (agora < inicio || agora >= fim) return null;
    return { ...suspensao, email: suspensao.email.trim().toLowerCase() };
  } catch {
    return null;
  }
}
