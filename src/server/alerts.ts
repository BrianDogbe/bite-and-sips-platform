import 'server-only';
import { sql } from './db';
import type { SessionUser } from './auth/sessions';
import { getSettings } from './settings';
import { openExceptions } from './ops';
import { lowStock } from './inventory';
import { formatLocalTime } from '@/lib/time';

export interface AdminAlert {
  id: string;
  tone: 'danger' | 'warn' | 'info';
  title: string;
  desc: string;
  href: string;
}

/** What needs the team's attention right now, limited to what this user may see. */
export async function adminAlerts(user: SessionUser): Promise<AdminAlert[]> {
  const can = (p: Parameters<SessionUser['permissions']['has']>[0]) => user.permissions.has(p);
  const out: AdminAlert[] = [];
  const tz = (await getSettings('restaurant')).timezone;
  if (can('orders.view')) {
    const [c] = await sql<{ attention: number; payments: number }[]>`
      select count(*) filter (where needs_attention and status <> 'completed')::int as attention,
             count(*) filter (where payment_status = 'reconciliation_required')::int as payments
      from orders where not is_test`;
    if (c.payments > 0) out.push({ id: 'pay', tone: 'danger', title: 'Payments need reconciliation', desc: `${c.payments} payment(s) to review`, href: '/admin/orders?payment=reconciliation_required' });
    if (c.attention > 0) out.push({ id: 'att', tone: 'danger', title: 'Orders need attention', desc: `${c.attention} flagged order(s)`, href: '/admin/orders?attention=1' });
  }
  if (can('dashboard.view')) {
    for (const e of (await openExceptions()).slice(0, 4)) {
      out.push({ id: `ex-${e.id}`, tone: 'warn', title: e.message, desc: `${e.orderNumber ? `${e.orderNumber} · ` : ''}${e.raisedByName ?? 'system'} at ${formatLocalTime(e.raisedAt, tz)}`, href: e.orderId ? `/admin/orders/${e.orderId}` : '/admin' });
    }
  }
  if (can('inventory.manage')) {
    for (const s of (await lowStock()).slice(0, 3)) {
      out.push({ id: `ls-${s.id}`, tone: 'danger', title: `Low stock: ${s.name}`, desc: `${Number(s.quantity)} ${s.unit} left, reorder at ${Number(s.reorderLevel)}`, href: '/admin/inventory' });
    }
  }
  if (can('support.manage')) {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from support_cases where status <> 'resolved'`;
    if (n > 0) out.push({ id: 'sup', tone: 'info', title: `${n} open support case(s)`, desc: 'Customers waiting for a reply', href: '/admin/support' });
  }
  return out;
}
