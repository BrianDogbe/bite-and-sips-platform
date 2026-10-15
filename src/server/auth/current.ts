import 'server-only';
// next/headers and next/navigation are imported lazily, only when running inside Next.js. The standalone backend
// never loads them (they pull in React client code that cannot run outside Next).
const nextHeaders = () => import('next/headers');
import { cache } from 'react';
import { requestContext, parseCookieHeader } from './context';
import { getSessionUser, SESSION_COOKIES, type Portal, type SessionUser } from './sessions';
import type { Permission } from './permissions';
import { env } from '../env';
import { clientIp } from '../http';

const PORTALS: Portal[] = ['admin', 'kitchen', 'rider', 'customer'];

export function asPortal(v: string | null | undefined): Portal | null {
  return PORTALS.includes(v as Portal) ? (v as Portal) : null;
}

/** Portal tagged on this request by middleware (null if untagged, e.g. outside a request). */
export async function requestPortal(): Promise<Portal | null> {
  try {
    const ctx = requestContext.getStore();
    if (ctx) return asPortal(ctx.headers.get('x-bs-portal'));
    return asPortal((await (await nextHeaders()).headers()).get('x-bs-portal'));
  } catch {
    return null;
  }
}

/**
 * Which session cookies may authenticate a request from `portal`, most specific first.
 * The customer site only ever uses the customer cookie. Admin and kitchen may share (an owner or
 * manager can use the kitchen screens). Permissions are always checked from the user's roles, so
 * this only decides where to look, never what is allowed.
 */
function candidateCookies(portal: Portal | null): string[] {
  switch (portal) {
    case 'customer':
      return [SESSION_COOKIES.customer];
    case 'admin':
      return [SESSION_COOKIES.admin, SESSION_COOKIES.kitchen];
    case 'kitchen':
      return [SESSION_COOKIES.kitchen, SESSION_COOKIES.admin];
    case 'rider':
      return [SESSION_COOKIES.rider];
    default:
      return [SESSION_COOKIES.admin, SESSION_COOKIES.kitchen, SESSION_COOKIES.rider, SESSION_COOKIES.customer];
  }
}

/** Current signed-in user for this request (memoised per request). */
async function loadCurrentUser(): Promise<SessionUser | null> {
  const ctx = requestContext.getStore();
  const jar = ctx ? parseCookieHeader(ctx.headers.get('cookie')) : await (await nextHeaders()).cookies();
  for (const name of candidateCookies(await requestPortal())) {
    const user = await getSessionUser(readCookie(jar, name));
    if (user) return user;
  }
  return null;
}

function readCookie(jar: Map<string, string> | { get(name: string): { value: string } | undefined }, name: string): string | undefined {
  const v = jar.get(name) as string | { value: string } | undefined;
  return typeof v === 'string' ? v : v?.value;
}

const getCurrentUserInNext = cache(loadCurrentUser);

export async function getCurrentUser(): Promise<SessionUser | null> {
  const ctx = requestContext.getStore();
  if (ctx) {
    // Standalone backend: memoise per request ourselves (React's cache() only works inside Next renders).
    if (!ctx.userLoaded) {
      ctx.user = await loadCurrentUser();
      ctx.userLoaded = true;
    }
    return ctx.user as SessionUser | null;
  }
  return getCurrentUserInNext();
}

/** Read one cookie from the current request (works in Next.js and in the standalone backend). */
export async function getRequestCookie(name: string): Promise<string | undefined> {
  const ctx = requestContext.getStore();
  if (ctx) return parseCookieHeader(ctx.headers.get('cookie')).get(name);
  return (await (await nextHeaders()).cookies()).get(name)?.value;
}

export async function requestIp(): Promise<string | null> {
  const ctx = requestContext.getStore();
  return clientIp(ctx ? ctx.headers : await (await nextHeaders()).headers());
}

export async function setSessionCookie(token: string, expiresAt: Date, portal: Portal = 'customer') {
  const options = {
    httpOnly: true,
    secure: env().NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    // Staff portals use a browser-session cookie: it survives refreshes but is gone when the browser is closed,
    // so opening the site afresh shows the sign-in. Customers keep a persistent login.
    ...(portal === 'customer' ? { expires: expiresAt } : {}),
  };
  const ctx = requestContext.getStore();
  if (ctx) {
    ctx.setCookies.push({ name: SESSION_COOKIES[portal], value: token, options });
    return;
  }
  (await (await nextHeaders()).cookies()).set(SESSION_COOKIES[portal], token, options);
}

export async function clearSessionCookie(portal: Portal = 'customer') {
  const ctx = requestContext.getStore();
  if (ctx) {
    ctx.setCookies.push({ name: SESSION_COOKIES[portal], value: '', options: { path: '/', maxAge: 0, expires: new Date(0), httpOnly: true, sameSite: 'lax' } });
    return;
  }
  (await (await nextHeaders()).cookies()).delete(SESSION_COOKIES[portal]);
}

/** For server components/pages: redirect to the portal login if not signed in / not permitted. */
export async function requirePagePerm(perm: Permission | Permission[], loginPath: string): Promise<SessionUser> {
  const redirect: (url: string) => never = (await import('next/navigation')).redirect;
  const user = await getCurrentUser();
  if (!user) redirect(`${loginPath}?next=${encodeURIComponent(loginPath.replace(/\/login$/, '') || '/')}`);
  const perms = Array.isArray(perm) ? perm : [perm];
  if (!perms.some((p) => user.permissions.has(p))) redirect(`${loginPath}?denied=1`);
  return user;
}
