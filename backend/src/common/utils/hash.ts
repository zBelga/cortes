import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const sha256 = (input: string | Buffer): string =>
  createHash('sha256').update(input).digest('hex');

/** ID determinístico de job — base da idempotência das filas. */
export const jobKey = (...parts: (string | number)[]): string =>
  createHash('sha1').update(parts.join(':')).digest('hex').slice(0, 32);

export const signPayload = (payload: string, secret: string): string =>
  createHmac('sha256', secret).update(payload).digest('hex');

/** Comparação em tempo constante — evita timing attack em verificação de assinatura. */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
