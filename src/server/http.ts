import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { isDomainError } from './errors';
import { env } from './env';
import { log } from './log';

/** Client IP (only trusts X-Forwarded-For when TRUST_PROXY=true, i.e. behind a known proxy/CDN). */
export function clientIp(headers: Headers): string | null {
  if (env().TRUST_PROXY === 'true') {
    const xf = headers.get('x-forwarded-for');
    if (xf) return xf.split(',')[0].trim().slice(0, 64);
    const real = headers.get('x-real-ip');
    if (real) return real.trim().slice(0, 64);
  }
  return headers.get('x-real-ip')?.slice(0, 64) ?? 'local';
}

/**
 * CSRF defence for cookie-authenticated JSON endpoints: state-changing requests must come from
 * our own origin (browsers always send Origin on cross-site POST). Webhooks don't use this.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return; // non-browser clients (no ambient cookies are exploitable without Origin in modern browsers)
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    const o = new URL(origin);
    if (host && o.host === host) return;
    const allowed = [env().APP_URL, env().ADMIN_HOST, env().KITCHEN_HOST, env().RIDER_HOST]
      .filter(Boolean)
      .map((h) => (h!.startsWith('http') ? new URL(h!).host : h));
    if (allowed.includes(o.host)) return;
  } catch {
    /* fallthrough */
  }
  const e = new Error('Cross-origin request blocked') as Error & { status?: number };
  e.status = 403;
  throw e;
}

export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw Object.assign(new Error('Request too large'), { status: 413 });
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

export function errorResponse(e: unknown) {
  if (isDomainError(e)) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details ?? null } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json({ error: { code: 'invalid', message: 'Invalid request.', details: e.flatten() } }, { status: 422 });
  }
  const status = (e as { status?: number })?.status;
  if (status && status >= 400 && status < 500) {
    return NextResponse.json({ error: { code: 'bad_request', message: (e as Error).message } }, { status });
  }
  log.error('unhandled_api_error', { error: e instanceof Error ? `${e.message}\n${e.stack}` : String(e) });
  return NextResponse.json({ error: { code: 'server_error', message: 'Something went wrong on our side. Please try again.' } }, { status: 500 });
}

/** Wrap a route handler with consistent error handling. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export const noStore = { 'Cache-Control': 'no-store' };
