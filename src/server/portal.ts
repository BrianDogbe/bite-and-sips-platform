/**
 * Which portal (admin / kitchen / rider / customer) a request belongs to. Shared by the Next.js middleware
 * and the standalone backend. The tag only chooses WHICH session cookie to read; it grants nothing.
 * No imports here: this file must stay usable from the Edge runtime.
 */
export type PortalName = 'admin' | 'kitchen' | 'rider' | 'customer';

export function portalOfPath(p: string): PortalName | null {
  if (p === '/admin' || p.startsWith('/admin/') || p.startsWith('/api/admin/') || p.startsWith('/api/dispatch/')) return 'admin';
  if (p === '/kitchen' || p.startsWith('/kitchen/') || p.startsWith('/api/kitchen/')) return 'kitchen';
  if (p === '/rider' || p.startsWith('/rider/') || p.startsWith('/api/rider/')) return 'rider';
  return null;
}

export function portalOfHostPath(host: string, p: string, hosts: { admin?: string; kitchen?: string; rider?: string } = {}): PortalName | null {
  for (const portal of ['admin', 'kitchen', 'rider'] as const) {
    const h = hosts[portal];
    if (h && host === h.toLowerCase()) return portal;
  }
  return portalOfPath(p);
}

/** Portal for a request. Shared API endpoints (realtime, logout…) use the page that called them (Referer). */
export function detectPortal(args: {
  host: string;
  path: string;
  referer: string | null;
  /** Host the browser actually used (x-forwarded-host when behind a proxy/rewrite). Referer must match it. */
  publicHost: string;
  hosts?: { admin?: string; kitchen?: string; rider?: string };
}): PortalName {
  const direct = portalOfHostPath(args.host, args.path, args.hosts);
  if (direct) return direct;
  if (args.path.startsWith('/api/') && args.referer) {
    try {
      const u = new URL(args.referer);
      if (u.host.toLowerCase() === args.publicHost.toLowerCase()) {
        return portalOfHostPath(u.hostname.toLowerCase(), u.pathname, args.hosts) ?? 'customer';
      }
    } catch {
      /* ignore malformed referer */
    }
  }
  return 'customer';
}
