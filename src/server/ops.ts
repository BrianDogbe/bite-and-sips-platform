import 'server-only';
import { z } from 'zod';
import { sql, tx, type Db, notifyChange } from './db';
import { invalid, notFound, conflict } from './errors';
import { audit } from './audit';
import { requirePerm, requireAnyPerm, actorOf } from './auth/guard';
import type { SessionUser } from './auth/sessions';
import { timeToMinutes } from '@/lib/time';

// ---------------------------------------------------------------------------
// Opening hours & closures
// ---------------------------------------------------------------------------

const hoursInput = z.array(
  z.object({
    weekday: z.number().int().min(0).max(6),
    opensAt: z.string().regex(/^\d{2}:\d{2}$/),
    closesAt: z.string().regex(/^\d{2}:\d{2}$/),
  }),
).max(28);

export async function replaceOperatingHours(user: SessionUser | null, raw: unknown, db: Db = sql) {
  requirePerm(user, 'settings.manage');
  const p = hoursInput.safeParse(raw);
  if (!p.success) throw invalid('Invalid opening hours.');
  for (const h of p.data) {
    if (timeToMinutes(h.closesAt) <= timeToMinutes(h.opensAt)) throw invalid('Closing time must be after opening time (overnight hours: split into two days).');
  }
  // reject overlaps on the same day
  for (let d = 0; d < 7; d++) {
    const day = p.data.filter((h) => h.weekday === d).sort((a, b) => a.opensAt.localeCompare(b.opensAt));
    for (let i = 1; i < day.length; i++) if (day[i].opensAt < day[i - 1].closesAt) throw invalid('Opening periods on the same day overlap.');
  }
  await tx(async (t) => {
    await t`delete from operating_hours`;
    for (const h of p.data) await t`insert into operating_hours (weekday, opens_at, closes_at) values (${h.weekday}, ${h.opensAt}, ${h.closesAt})`;
    await audit(t, actorOf(user), 'settings.hours_updated', 'settings', 'operating_hours', { hours: p.data });
  }, db);
}

export async function addClosure(user: SessionUser | null, raw: { startsAt: string; endsAt: string; scope: 'all' | 'pickup' | 'delivery'; reason: string }, db: Db = sql) {
  requirePerm(user, 'settings.manage');
  const s = new Date(raw.startsAt);
  const e = new Date(raw.endsAt);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) throw invalid('End must be after start.');
  if (!raw.reason?.trim()) throw invalid('Give a reason (shown to customers).');
  if (!['all', 'pickup', 'delivery'].includes(raw.scope)) throw invalid('Invalid scope.');
  return tx(async (t) => {
    const [r] = await t<{ id: number }[]>`insert into service_closures (starts_at, ends_at, scope, reason, created_by) values (${s}, ${e}, ${raw.scope}, ${raw.reason.trim()}, ${user!.id}) returning id`;
    await audit(t, actorOf(user), 'settings.closure_added', 'service_closure', r.id, raw);
    return r.id;
  }, db);
}

export async function removeClosure(user: SessionUser | null, id: number, db: Db = sql) {
  requirePerm(user, 'settings.manage');
  await tx(async (t) => {
    await t`delete from service_closures where id = ${id}`;
    await audit(t, actorOf(user), 'settings.closure_removed', 'service_closure', id);
  }, db);
}

export async function upcomingClosures(db: Db = sql) {
  return db<{ id: number; startsAt: Date; endsAt: Date; scope: string; reason: string }[]>`
    select id, starts_at, ends_at, scope, reason from service_closures where ends_at > now() order by starts_at`;
}

// ---------------------------------------------------------------------------
// Delivery zones
// ---------------------------------------------------------------------------

export const zoneInput = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional().nullable(),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(100).max(50000),
  feePesewas: z.number().int().min(0).max(100_000),
  perKmPesewas: z.number().int().min(0).max(50_000).default(0),
  maxFeePesewas: z.number().int().min(0).max(100_000).nullable().default(null),
  minOrderPesewas: z.number().int().min(0).max(1_000_000),
  etaMinMinutes: z.number().int().min(0).max(300).nullable().optional(),
  etaMaxMinutes: z.number().int().min(0).max(300).nullable().optional(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export async function saveZone(user: SessionUser | null, raw: unknown, db: Db = sql) {
  requirePerm(user, 'settings.manage');
  const p = zoneInput.safeParse(raw);
  if (!p.success) throw invalid('Please check the zone details.', p.error.flatten());
  const z0 = p.data;
  if (z0.etaMinMinutes != null && z0.etaMaxMinutes != null && z0.etaMaxMinutes < z0.etaMinMinutes) throw invalid('ETA max must be at least ETA min.');
  return tx(async (t) => {
    let id = z0.id;
    if (id) {
      const r = await t`update delivery_zones set name = ${z0.name}, description = ${z0.description ?? null}, center_lat = ${z0.centerLat}, center_lng = ${z0.centerLng},
        radius_m = ${z0.radiusM}, fee_pesewas = ${z0.feePesewas}, per_km_pesewas = ${z0.perKmPesewas}, max_fee_pesewas = ${z0.maxFeePesewas}, min_order_pesewas = ${z0.minOrderPesewas}, eta_min_minutes = ${z0.etaMinMinutes ?? null},
        eta_max_minutes = ${z0.etaMaxMinutes ?? null}, is_active = ${z0.isActive}, sort_order = ${z0.sortOrder}, is_demo = false where id = ${id} returning id`;
      if (!r.length) throw notFound('Zone');
    } else {
      const [r] = await t<{ id: number }[]>`insert into delivery_zones (name, description, center_lat, center_lng, radius_m, fee_pesewas, per_km_pesewas, max_fee_pesewas, min_order_pesewas, eta_min_minutes, eta_max_minutes, is_active, sort_order)
        values (${z0.name}, ${z0.description ?? null}, ${z0.centerLat}, ${z0.centerLng}, ${z0.radiusM}, ${z0.feePesewas}, ${z0.perKmPesewas}, ${z0.maxFeePesewas}, ${z0.minOrderPesewas}, ${z0.etaMinMinutes ?? null}, ${z0.etaMaxMinutes ?? null}, ${z0.isActive}, ${z0.sortOrder}) returning id`;
      id = r.id;
    }
    await audit(t, actorOf(user), 'settings.zone_saved', 'delivery_zone', id!, z0);
    return id!;
  }, db);
}

// ---------------------------------------------------------------------------
// Operational exceptions (kitchen/delivery issues raised for management)
// ---------------------------------------------------------------------------

export async function raiseException(
  user: SessionUser | null,
  args: { orderId?: string | null; kind: 'kitchen_delay' | 'kitchen_issue' | 'delivery_issue' | 'payment_issue' | 'other'; message: string },
  db: Db = sql,
) {
  requireAnyPerm(user, ['kitchen.operate', 'dispatch.manage', 'orders.manage', 'rider.deliver']);
  if (!args.message?.trim()) throw invalid('Describe the issue.');
  return tx(async (t) => {
    const [r] = await t<{ id: string }[]>`insert into operational_exceptions (order_id, kind, message, raised_by) values (${args.orderId ?? null}, ${args.kind}, ${args.message.trim().slice(0, 500)}, ${user!.id}) returning id`;
    if (args.orderId) {
      await t`update orders set needs_attention = true, attention_reason = ${`${args.kind.replace('_', ' ')}: ${args.message.trim().slice(0, 200)}`} where id = ${args.orderId}`;
      await t`insert into order_events (order_id, domain, type, message, actor_user_id, actor_label) values (${args.orderId}, 'order', 'exception.raised', ${args.message.trim()}, ${user!.id}, 'staff')`;
    }
    await notifyChange(t, { topic: 'admin' });
    return r.id;
  }, db);
}

export async function resolveException(user: SessionUser | null, id: string, resolution: string, db: Db = sql) {
  requireAnyPerm(user, ['orders.manage', 'dispatch.manage', 'kitchen.monitor']);
  if (!resolution?.trim()) throw invalid('Describe how it was resolved.');
  await tx(async (t) => {
    const r = await t`update operational_exceptions set resolved_at = now(), resolved_by = ${user!.id}, resolution = ${resolution.trim()} where id = ${id} and resolved_at is null returning id`;
    if (!r.length) throw conflict('Already resolved.');
    await audit(t, actorOf(user), 'ops.exception_resolved', 'operational_exception', id, { resolution });
    await notifyChange(t, { topic: 'admin' });
  }, db);
}

export async function openExceptions(db: Db = sql) {
  return db<{ id: string; orderId: string | null; orderNumber: string | null; kind: string; message: string; raisedAt: Date; raisedByName: string | null }[]>`
    select e.id, e.order_id, o.order_number, e.kind, e.message, e.raised_at, u.full_name as raised_by_name
    from operational_exceptions e left join orders o on o.id = e.order_id left join users u on u.id = e.raised_by
    where e.resolved_at is null and (e.order_id is null or o.needs_attention) order by e.raised_at desc limit 100`;
}

// ---------------------------------------------------------------------------
// Attention flags on orders
// ---------------------------------------------------------------------------
export async function clearOrderAttention(user: SessionUser | null, orderId: string, note: string, db: Db = sql) {
  requirePerm(user, 'orders.manage');
  if (!note?.trim()) throw invalid('Add a note describing what was done.');
  await tx(async (t) => {
    const r = await t`update orders set needs_attention = false, attention_reason = null, version = version + 1, updated_at = now() where id = ${orderId} returning id`;
    if (!r.length) throw notFound('Order');
    await t`insert into order_events (order_id, domain, type, message, actor_user_id, actor_label) values (${orderId}, 'order', 'order.attention_cleared', ${note.trim()}, ${user!.id}, 'staff')`;
    // Reported problems on this order are resolved together with the attention flag.
    await t`update operational_exceptions set resolved_at = now(), resolved_by = ${user!.id}, resolution = ${note.trim()} where order_id = ${orderId} and resolved_at is null`;
    await audit(t, actorOf(user), 'order.attention_cleared', 'order', orderId, { note });
    await notifyChange(t, { topic: 'admin' });
    await notifyChange(t, { topic: 'kitchen' });
    await notifyChange(t, { topic: `order:${orderId}` });
  }, db);
}

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------
export const promoInput = z.object({
  id: z.number().int().positive().optional(),
  code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, - and _ only'),
  description: z.string().trim().max(200).optional().nullable(),
  discountType: z.enum(['percent', 'fixed']),
  discountValue: z.number().int().positive(),
  minSubtotalPesewas: z.number().int().min(0).default(0),
  maxDiscountPesewas: z.number().int().positive().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().default(true),
});

export async function savePromotion(user: SessionUser | null, raw: unknown, db: Db = sql) {
  requirePerm(user, 'menu.manage');
  const p = promoInput.safeParse(raw);
  if (!p.success) throw invalid('Please check the promotion.', p.error.flatten());
  const v = p.data;
  if (v.discountType === 'percent' && v.discountValue > 100) throw invalid('Percent discounts cannot exceed 100.');
  return tx(async (t) => {
    let id = v.id;
    try {
      if (id) {
        await t`update promotions set code = ${v.code.toUpperCase()}, description = ${v.description ?? null}, discount_type = ${v.discountType}, discount_value = ${v.discountValue},
          min_subtotal_pesewas = ${v.minSubtotalPesewas}, max_discount_pesewas = ${v.maxDiscountPesewas ?? null}, starts_at = ${v.startsAt ?? null}, ends_at = ${v.endsAt ?? null},
          usage_limit = ${v.usageLimit ?? null}, is_active = ${v.isActive} where id = ${id}`;
      } else {
        const [r] = await t<{ id: number }[]>`insert into promotions (code, description, discount_type, discount_value, min_subtotal_pesewas, max_discount_pesewas, starts_at, ends_at, usage_limit, is_active)
          values (${v.code.toUpperCase()}, ${v.description ?? null}, ${v.discountType}, ${v.discountValue}, ${v.minSubtotalPesewas}, ${v.maxDiscountPesewas ?? null}, ${v.startsAt ?? null}, ${v.endsAt ?? null}, ${v.usageLimit ?? null}, ${v.isActive}) returning id`;
        id = r.id;
      }
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw conflict('That code already exists.');
      throw e;
    }
    await audit(t, actorOf(user), 'promo.saved', 'promotion', id!, v);
    return id!;
  }, db);
}

export async function listPromotions(db: Db = sql) {
  return db`select * from promotions order by created_at desc`;
}
