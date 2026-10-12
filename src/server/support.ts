import 'server-only';
import { sql, tx, type Db, notifyChange } from './db';
import { invalid, notFound } from './errors';
import { audit } from './audit';
import { requirePerm, actorOf } from './auth/guard';
import type { SessionUser } from './auth/sessions';
import { supportCaseSchema } from '@/lib/validation';
import { newCaseNumber } from './ids';
import { enforceRateLimit } from './auth/rate-limit';
import { normalizePhone } from './auth/sessions';

/** Customer opens a support case (optionally linked to an order via its secret tracking token). */
export async function openSupportCase(raw: unknown, ctx: { user: SessionUser | null; ip: string | null }, db: Db = sql) {
  await enforceRateLimit(`support:ip:${ctx.ip ?? 'unknown'}`, 5, 60 * 60, db);
  const p = supportCaseSchema.safeParse(raw);
  if (!p.success) throw invalid('Please check the form.', p.error.flatten());
  const v = p.data;
  if (!v.phone && !v.email) throw invalid('Give us a phone number or email so we can reply.');
  return tx(async (t) => {
    let orderId: string | null = null;
    if (v.trackingToken) {
      const [o] = await t<{ id: string }[]>`select id from orders where tracking_token = ${v.trackingToken}`;
      orderId = o?.id ?? null;
    } else if (v.orderNumber && v.phone) {
      // Only link by order number when the phone matches (prevents attaching to someone else's order).
      const [o] = await t<{ id: string }[]>`select id from orders where order_number = ${v.orderNumber.toUpperCase()} and customer_phone = ${normalizePhone(v.phone)}`;
      orderId = o?.id ?? null;
    }
    const caseNumber = newCaseNumber();
    const [c] = await t<{ id: string }[]>`
      insert into support_cases (case_number, order_id, customer_user_id, contact_name, contact_phone, contact_email, category, message)
      values (${caseNumber}, ${orderId}, ${ctx.user?.id ?? null}, ${v.name}, ${v.phone ? normalizePhone(v.phone) : null}, ${v.email || null}, ${v.category}, ${v.message})
      returning id`;
    if (orderId) {
      await t`insert into order_events (order_id, domain, type, message, actor_label, customer_visible) values (${orderId}, 'support', 'support.opened', ${`Support case ${caseNumber} opened`}, 'customer', true)`;
    }
    await notifyChange(t, { topic: 'admin' });
    return { id: c.id, caseNumber, linkedToOrder: !!orderId };
  }, db);
}

export async function listCases(user: SessionUser | null, status: string | null, db: Db = sql) {
  requirePerm(user, 'support.manage');
  return db<{ id: string; caseNumber: string; orderId: string | null; orderNumber: string | null; contactName: string; contactPhone: string | null; contactEmail: string | null; category: string; message: string; status: string; assignedName: string | null; createdAt: Date }[]>`
    select c.id, c.case_number, c.order_id, o.order_number, c.contact_name, c.contact_phone, c.contact_email, c.category, c.message, c.status,
           u.full_name as assigned_name, c.created_at
    from support_cases c left join orders o on o.id = c.order_id left join users u on u.id = c.assigned_to
    where (${status}::text is null or c.status = ${status})
    order by case c.status when 'open' then 0 when 'in_progress' then 1 else 2 end, c.created_at desc limit 200`;
}

export async function caseDetail(user: SessionUser | null, id: string, db: Db = sql) {
  requirePerm(user, 'support.manage');
  const [c] = await db`select c.*, o.order_number from support_cases c left join orders o on o.id = c.order_id where c.id = ${id}`;
  if (!c) throw notFound('Case');
  const notes = await db`select n.*, u.full_name as author_name from support_notes n left join users u on u.id = n.author_id where n.case_id = ${id} order by n.id`;
  return { case: c, notes };
}

export async function updateCase(user: SessionUser | null, id: string, args: { status?: 'open' | 'in_progress' | 'resolved'; assignToMe?: boolean; note?: string }, db: Db = sql) {
  requirePerm(user, 'support.manage');
  await tx(async (t) => {
    const [c] = await t`select id from support_cases where id = ${id} for update`;
    if (!c) throw notFound('Case');
    if (args.status) await t`update support_cases set status = ${args.status}, resolved_at = ${args.status === 'resolved' ? new Date() : null}, updated_at = now() where id = ${id}`;
    if (args.assignToMe) await t`update support_cases set assigned_to = ${user!.id}, status = case when status = 'open' then 'in_progress' else status end, updated_at = now() where id = ${id}`;
    if (args.note?.trim()) await t`insert into support_notes (case_id, author_id, note) values (${id}, ${user!.id}, ${args.note.trim().slice(0, 2000)})`;
    await audit(t, actorOf(user), 'support.updated', 'support_case', id, { status: args.status ?? null, assignToMe: !!args.assignToMe, noted: !!args.note });
  }, db);
}
