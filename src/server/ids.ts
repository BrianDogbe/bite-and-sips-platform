import 'server-only';
import { randomBytes, randomInt, createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Crockford-style alphabet without easily confused characters (no 0/O, 1/I/L, U).
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export function randomCode(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** Customer-facing order number: BS-7K4QM2. Random, so it does not leak order volume. */
export function newOrderNumber(): string {
  return `BS-${randomCode(6)}`;
}

export function newCaseNumber(): string {
  return `SC-${randomCode(6)}`;
}

/** 256-bit URL-safe secret. */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hmacHex(secret: string, input: string, algo: 'sha256' | 'sha512' = 'sha256'): string {
  return createHmac(algo, secret).update(input).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export function safeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function newPaymentReference(orderNumber: string): string {
  return `${orderNumber}-${randomCode(6)}`;
}
