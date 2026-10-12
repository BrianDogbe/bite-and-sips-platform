import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
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
    return asPortal((await headers()).get('x-bs-portal'));
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
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const c = await cookies();
  for (const name of candidateCookies(await requestPortal())) {
    const user = await getSessionUser(c.get(name)?.value);
    if (user) return user;
  }
  return null;
});

export async function requestIp(): Promise<string | null> {
  return clientIp(await headers());
}

export async function setSessionCookie(token: string, expiresAt: Date, portal: Portal = 'customer') {
  const c = await cookies();
  c.set(SESSION_COOKIES[portal], token, {
    httpOnly: true,
    secure: env().NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie(portal: Portal = 'customer') {
  const c = await cookies();
  c.delete(SESSION_COOKIES[portal]);
}

/** For server components/pages: redirect to the portal login if not signed in / not permitted. */
export async function requirePagePerm(perm: Permission | Permission[], loginPath: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`${loginPath}?next=${encodeURIComponent(loginPath.replace(/\/login$/, '') || '/')}`);
  const perms = Array.isArray(perm) ? perm : [perm];
  if (!perms.some((p) => user.permissions.has(p))) redirect(`${loginPath}?denied=1`);
  return user;
}
