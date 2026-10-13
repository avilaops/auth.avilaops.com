import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * Endereços para onde o Auth não manda requisição a pedido de terceiros.
 *
 * O endereço de entrega dos sinais é escolhido pelo receptor. Sem esta
 * conferência, quem tem o escopo de gerir o canal faria o Auth bater, de
 * dentro do servidor, em serviço que só a rede interna alcança.
 *
 * `SSF_REDE_INTERNA=1` desliga a conferência. Existe para o ambiente de teste,
 * onde o receptor é um contêiner vizinho.
 */
const internos = new BlockList();
for (const [rede, prefixo] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
] as const) {
  internos.addSubnet(rede, prefixo, "ipv4");
}
for (const [rede, prefixo] of [
  ["::", 127],
  ["fc00::", 7],
  ["fe80::", 10],
] as const) {
  internos.addSubnet(rede, prefixo, "ipv6");
}

function liberado(): boolean {
  return process.env.SSF_REDE_INTERNA === "1";
}

export function ipInterno(ip: string): boolean {
  const limpo = ip.replace(/^\[|\]$/g, "");
  // IPv4 embutido em IPv6 (::ffff:10.0.0.1) vale pelo IPv4.
  const embutido = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(limpo)?.[1];
  if (embutido) return internos.check(embutido, "ipv4");
  const tipo = isIP(limpo);
  if (tipo === 0) return false;
  return internos.check(limpo, tipo === 4 ? "ipv4" : "ipv6");
}

/** Pelo nome só: `localhost`, nomes internos e IP escrito direto. Não consulta o DNS. */
export function hostInterno(hostname: string): boolean {
  if (liberado()) return false;
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  return ipInterno(h);
}

/** Pelo DNS: verdadeiro se o nome não resolve ou se algum endereço dele é da rede interna. */
export async function resolveParaRedeInterna(hostname: string): Promise<boolean> {
  if (liberado()) return false;
  if (hostInterno(hostname)) return true;
  if (isIP(hostname.replace(/^\[|\]$/g, ""))) return false;
  try {
    const enderecos = await lookup(hostname, { all: true });
    return enderecos.length === 0 || enderecos.some((e) => ipInterno(e.address));
  } catch {
    return true;
  }
}
