import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function hashPedidoMcp(query: string) {
  const q = new URLSearchParams(query);
  q.delete('mcp_consent');
  q.sort();
  return createHash('sha256').update(q.toString()).digest('hex');
}
export function seloConsentimentoMcp(sub: string, query: string, expira: number) {
  const chave = process.env.SSO_JWT_SECRET;
  if (!chave) throw new Error('Assinatura indisponível');
  return createHmac('sha256', chave).update(JSON.stringify(['mcp-consent-v1', sub, hashPedidoMcp(query), expira])).digest('hex');
}
export function conferirConsentimentoMcp(sub: string, query: string, expira: number, selo: string) {
  if (!Number.isSafeInteger(expira) || expira < Date.now() || expira > Date.now() + 600_000 || !/^[a-f0-9]{64}$/.test(selo)) return false;
  return timingSafeEqual(Buffer.from(selo, 'hex'), Buffer.from(seloConsentimentoMcp(sub, query, expira), 'hex'));
}
