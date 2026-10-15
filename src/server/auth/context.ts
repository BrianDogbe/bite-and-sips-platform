import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request context used when the code runs in the standalone backend (not inside Next.js).
 * Inside Next.js the store is empty and the code falls back to `next/headers`.
 */
export interface SetCookie {
  name: string;
  value: string;
  options: { httpOnly?: boolean; secure?: boolean; sameSite?: 'lax' | 'strict' | 'none'; path?: string; expires?: Date; maxAge?: number };
}
export interface RequestContext {
  headers: Headers;
  setCookies: SetCookie[];
  user?: unknown;
  userLoaded?: boolean;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function parseCookieHeader(header: string | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    let v = part.slice(i + 1).trim();
    try {
      v = decodeURIComponent(v);
    } catch {
      /* keep raw */
    }
    if (!out.has(k)) out.set(k, v);
  }
  return out;
}

export function serializeSetCookie(c: SetCookie): string {
  const o = c.options;
  const parts = [`${c.name}=${encodeURIComponent(c.value)}`];
  parts.push(`Path=${o.path ?? '/'}`);
  if (o.expires) parts.push(`Expires=${o.expires.toUTCString()}`);
  if (o.maxAge != null) parts.push(`Max-Age=${Math.floor(o.maxAge)}`);
  if (o.httpOnly) parts.push('HttpOnly');
  if (o.secure) parts.push('Secure');
  if (o.sameSite) parts.push(`SameSite=${o.sameSite[0].toUpperCase()}${o.sameSite.slice(1)}`);
  return parts.join('; ');
}
