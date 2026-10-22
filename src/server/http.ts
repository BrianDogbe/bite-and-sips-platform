import 'server-only';
import { NextResponse } from '@/server/response';
import { ZodError } from 'zod';
import { isDomainError } from './errors';
import { env } from './env';
import { log } from './log';

let warnedUntrustedProxy = false;

/**
 * Client IP, used as the key for rate limits.
 *
 * Forwarding headers (X-Forwarded-For, X-Real-IP) are written by the caller, so a visitor can put anything in them.
 * They are only believed when TRUST_PROXY=true, meaning the site really sits behind proxies that add the address of
 * whoever connected to them. Each trusted proxy appends the address it saw, so the real client is the entry
 * TRUSTED_PROXY_HOPS places from the END of the list; anything a visitor wrote sits further to the left and is ignored.
 *
 * With TRUST_PROXY=false every request shares one bucket ('local'): fine for development, but in production behind a
 * proxy it would make visitors share limits, so a warning is logged once to remind you to set TRUST_PROXY=true.
 */
export function clientIp(headers: Headers): string | null {
  const e = env();
  if (e.TRUST_PROXY !== 'true') {
    if (e.NODE_ENV === 'production' && !warnedUntrustedProxy) {
      warnedUntrustedProxy = true;
      log.warn('trust_proxy_off_in_production', {
        note: 'All visitors share one rate-limit bucket. Set TRUST_PROXY=true (and TRUSTED_PROXY_HOPS) when running behind a proxy or CDN.',
      });
    }
    return 'local';
  }
  const xf = headers.get('x-forwarded-for');
  if (xf) {
    const parts = xf.split(',').map((p) => p.trim()).filter(Boolean);
    const ip = parts[Math.max(0, parts.length - e.TRUSTED_PROXY_HOPS)];
    if (ip) return ip.slice(0, 64);
  }
  const real = headers.get('x-real-ip');
  if (real) return real.trim().slice(0, 64);
  return 'local';
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
