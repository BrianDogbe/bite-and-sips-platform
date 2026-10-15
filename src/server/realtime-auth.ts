import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from './db';
import { env } from './env';
import type { SessionUser } from './auth/sessions';

/**
 * Which realtime topics may this caller subscribe to?
 *   kitchen  → kitchen.operate / kitchen.monitor
 *   dispatch → dispatch.manage
 *   admin    → dashboard.view
 *   rider    → the signed-in rider's own topic
 *   order    → requires the order's secret tracking token
 * Everyone may receive the public `menu` topic. Payloads never carry personal data.
 */
export async function authorizeTopics(user: SessionUser | null, want: string[], token: string | null): Promise<Set<string>> {
  const topics = new Set<string>(['menu']);
  for (const t of want.slice(0, 5)) {
    if (t === 'kitchen' && (user?.permissions.has('kitchen.operate') || user?.permissions.has('kitchen.monitor'))) topics.add('kitchen');
    else if (t === 'dispatch' && user?.permissions.has('dispatch.manage')) topics.add('dispatch');
    else if (t === 'admin' && user?.permissions.has('dashboard.view')) topics.add('admin');
    else if (t === 'rider' && user?.permissions.has('rider.deliver')) topics.add(`rider:${user.id}`);
  }
  if (token && token.length >= 20 && token.length <= 100) {
    const [o] = await sql<{ id: string }[]>`select id from orders where tracking_token = ${token}`;
    if (o) topics.add(`order:${o.id}`);
  }
  return topics;
}

/**
 * Short-lived signed ticket listing the topics a browser may join over WebSocket. The websocket server can live on a
 * different origin (where the site's cookies are not sent), so the page first asks the main site for a ticket.
 */
const TICKET_TTL_MS = 5 * 60 * 1000;

function mac(payload: string): string {
  return createHmac('sha256', env().APP_SECRET).update(`realtime-ticket:${payload}`).digest('base64url');
}

export function signTicket(topics: string[], now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ t: topics, exp: now + TICKET_TTL_MS })).toString('base64url');
  return `${payload}.${mac(payload)}`;
}

export function verifyTicket(ticket: unknown, now = Date.now()): string[] | null {
  if (typeof ticket !== 'string' || ticket.length > 4000) return null;
  const [payload, sig] = ticket.split('.');
  if (!payload || !sig) return null;
  const expected = mac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { t: string[]; exp: number };
    if (!Array.isArray(body.t) || typeof body.exp !== 'number' || body.exp < now) return null;
    return body.t.filter((x) => typeof x === 'string').slice(0, 20);
  } catch {
    return null;
  }
}
