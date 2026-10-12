import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optional subdomain routing: admin.example.com → /admin, kitchen.example.com → /kitchen,
 * rider.example.com → /rider (configure ADMIN_HOST / KITCHEN_HOST / RIDER_HOST).
 * All portals are the SAME application and database; this only maps hosts to route groups.
 *
 * It also tags every request with the portal it belongs to (`x-bs-portal`). Each portal keeps its
 * own session cookie, so signing in to the rider app does not sign you out of the admin portal.
 * The tag only chooses WHICH cookie to read; it grants nothing.
 *
 * Authentication and authorisation are NOT done here — every page and API checks the session and
 * permissions on the server (middleware must never be the only protection).
 */
const PORTALS: { env: string | undefined; prefix: string }[] = [
  { env: process.env.ADMIN_HOST, prefix: '/admin' },
  { env: process.env.KITCHEN_HOST, prefix: '/kitchen' },
  { env: process.env.RIDER_HOST, prefix: '/rider' },
];

const PORTAL_HEADER = 'x-bs-portal';

function portalOfPath(p: string): string | null {
  if (p === '/admin' || p.startsWith('/admin/') || p.startsWith('/api/admin/') || p.startsWith('/api/dispatch/')) return 'admin';
  if (p === '/kitchen' || p.startsWith('/kitchen/') || p.startsWith('/api/kitchen/')) return 'kitchen';
  if (p === '/rider' || p.startsWith('/rider/') || p.startsWith('/api/rider/')) return 'rider';
  return null;
}

function portalOfHostPath(host: string, p: string): string | null {
  for (const portal of PORTALS) {
    if (portal.env && host === portal.env.toLowerCase()) return portal.prefix.slice(1);
  }
  return portalOfPath(p);
}

/** The portal this request belongs to; shared API endpoints (realtime, logout…) use the calling page. */
function detectPortal(req: NextRequest, host: string, p: string): string {
  const direct = portalOfHostPath(host, p);
  if (direct) return direct;
  if (p.startsWith('/api/')) {
    const ref = req.headers.get('referer');
    if (ref) {
      try {
        const u = new URL(ref);
        if (u.host.toLowerCase() === (req.headers.get('host') ?? '').toLowerCase()) {
          return portalOfHostPath(u.hostname.toLowerCase(), u.pathname) ?? 'customer';
        }
      } catch {
        /* ignore malformed referer */
      }
    }
  }
  return 'customer';
}

export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  const url = req.nextUrl;
  const p = url.pathname;

  // Always overwrite any client-supplied value.
  const headers = new Headers(req.headers);
  headers.set(PORTAL_HEADER, detectPortal(req, host, p));

  if (p.startsWith('/api/') || p.startsWith('/_next/') || p.startsWith('/media/') || p === '/rider-sw.js' || p === '/favicon.ico') {
    return NextResponse.next({ request: { headers } });
  }

  for (const portal of PORTALS) {
    if (portal.env && host === portal.env.toLowerCase()) {
      if (!p.startsWith(portal.prefix)) {
        const dest = new URL(req.url);
        dest.pathname = `${portal.prefix}${p === '/' ? '' : p}`;
        return NextResponse.rewrite(dest, { request: { headers } });
      }
      return NextResponse.next({ request: { headers } });
    }
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
