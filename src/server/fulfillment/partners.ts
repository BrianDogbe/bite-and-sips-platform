import 'server-only';
import { sql, tx, type Db } from '../db';
import { env } from '../env';
import { conflict, invalid, notFound } from '../errors';
import { audit, type Actor } from '../audit';
import { hmacHex, safeEqualHex } from '../ids';
import { requirePerm, actorOf } from '../auth/guard';
import type { SessionUser } from '../auth/sessions';
import { notifyOrder, kickNotificationDispatch } from '../notifications';
import { lockOrder, lockFulfillment, setFulfillmentStatus, setKitchenStatus, setOrderStatus, flagAttention, signalOrder } from '../orders/core';
import { canTransition, DELIVERY_TRANSITIONS, type DeliveryStatus } from '@/lib/states';
import { log } from '../log';
import { getSettings } from '../settings';

/**
 * Third-party delivery integration layer.
 *
 * Every partner is an adapter behind one interface. Capabilities differ per partner, so each adapter
 * declares what it supports and the dispatch UI only offers those actions. When a partner has no API
 * (or no agreement / credentials yet), staff record the booking MANUALLY — status is then clearly
 * labelled as manually entered.
 *
 * No real Ghana delivery-partner API is integrated yet (none was available with credentials).
 * The `sandbox` adapter is a SIMULATION for development, disabled unless DELIVERY_SANDBOX_PROVIDER=true
 * and never available in production.
 */

export type PartnerStatus = 'requested' | 'accepted' | 'rejected' | 'courier_assigned' | 'picked_up' | 'on_the_way' | 'delivered' | 'failed' | 'cancelled';

export interface PartnerCapabilities {
  createDelivery: boolean;
  quote: boolean;
  cancel: boolean;
  statusWebhook: boolean;
  statusPolling: boolean;
  courierDetails: boolean;
  trackingUrl: boolean;
  lookupByReference: boolean;
}

export interface PartnerBookingResult {
  externalId: string;
  status: PartnerStatus;
  quotedFeePesewas: number | null;
  trackingUrl?: string | null;
  courierName?: string | null;
  courierPhone?: string | null;
}

export class PartnerUncertainError extends Error {}

export interface DeliveryPartnerAdapter {
  key: string;
  label: string;
  simulated: boolean;
  capabilities: PartnerCapabilities;
  requestDelivery(args: {
    idempotencyKey: string;
    orderNumber: string;
    pickup: { name: string; phone: string; address: string; lat: number | null; lng: number | null };
    dropoff: { name: string; phone: string; address: string; landmark: string | null; lat: number | null; lng: number | null; instructions: string | null };
    valuePesewas: number;
  }): Promise<PartnerBookingResult>;
  cancel?(externalId: string): Promise<{ cancelled: boolean; detail?: string }>;
  getStatus?(externalId: string): Promise<Partial<PartnerBookingResult> & { status: PartnerStatus }>;
  lookupByReference?(idempotencyKey: string): Promise<PartnerBookingResult | null>;
  verifyWebhook?(rawBody: string, headers: Headers): boolean;
  parseWebhook?(rawBody: string): { externalId: string; status: PartnerStatus; eventId: string; courierName?: string | null; courierPhone?: string | null; trackingUrl?: string | null; finalFeePesewas?: number | null };
}

// ---------------------------------------------------------------------------
// Sandbox (simulation) adapter — development only
// ---------------------------------------------------------------------------
export function sandboxSecret() {
  return hmacHex(env().APP_SECRET, 'delivery-sandbox');
}

const sandboxAdapter: DeliveryPartnerAdapter = {
  key: 'sandbox',
  label: 'Sandbox courier (SIMULATION)',
  simulated: true,
  capabilities: { createDelivery: true, quote: true, cancel: true, statusWebhook: true, statusPolling: false, courierDetails: true, trackingUrl: false, lookupByReference: false },
  async requestDelivery(args) {
    return { externalId: `SBX-${args.idempotencyKey.slice(0, 10)}`, status: 'requested', quotedFeePesewas: 2500 };
  },
  async cancel() {
    return { cancelled: true };
  },
  verifyWebhook(rawBody, headers) {
    const sig = headers.get('x-sandbox-signature');
    return !!sig && safeEqualHex(hmacHex(sandboxSecret(), rawBody, 'sha256'), sig);
  },
  parseWebhook(rawBody) {
    const p = JSON.parse(rawBody) as { eventId: string; externalId: string; status: PartnerStatus; courierName?: string; courierPhone?: string; finalFeePesewas?: number };
    return p;
  },
};

const registry = new Map<string, DeliveryPartnerAdapter>();

function sandboxEnabled() {
  const e = env();
  return e.DELIVERY_SANDBOX_PROVIDER === 'true' && e.NODE_ENV !== 'production';
}

export function partnerAdapters(): DeliveryPartnerAdapter[] {
  const list = [...registry.values()];
  if (sandboxEnabled()) list.unshift(sandboxAdapter);
  return list;
}

export function getPartnerAdapter(key: string): DeliveryPartnerAdapter | null {
  if (key === 'sandbox') return sandboxEnabled() ? sandboxAdapter : null;
  return registry.get(key) ?? null;
}

/** Register a real partner adapter at startup (or a fake one in tests). */
export function registerPartnerAdapter(a: DeliveryPartnerAdapter) {
  registry.set(a.key, a);
}
export function unregisterPartnerAdapter(key: string) {
  registry.delete(key);
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export interface BookingRow {
  id: string;
  orderId: string;
  provider: string;
  idempotencyKey: string;
  externalId: string | null;
  status: 'requesting' | 'unknown' | PartnerStatus | 'cancel_failed';
  quotedFeePesewas: number | null;
  finalFeePesewas: number | null;
  isManual: boolean;
  lastError: string | null;
  notes: string | null;
  lastSyncedAt: Date | null;
  reconciledAt: Date | null;
  createdAt: Date;
}

const PARTNER_TO_FULFILLMENT: Partial<Record<PartnerStatus, DeliveryStatus>> = {
  requested: 'requested',
  accepted: 'requested',
  courier_assigned: 'assigned',
  picked_up: 'picked_up',
  on_the_way: 'on_the_way',
  delivered: 'delivered',
  failed: 'failed',
};

/**
 * Request a delivery from an API partner. Idempotent: the booking row (unique idempotency key and
 * at most one live booking per order) is committed BEFORE calling the partner, so a retry after a
 * timeout never creates a second delivery — it must be reconciled first.
 */
export async function requestPartnerDelivery(user: SessionUser | null, args: { orderId: string; provider: string; idempotencyKey: string }, db: Db = sql) {
  requirePerm(user, 'dispatch.manage');
  const actor = actorOf(user);
  const adapter = getPartnerAdapter(args.provider);
  if (!adapter || !adapter.capabilities.createDelivery) throw invalid('That delivery partner cannot be booked automatically. Record a manual booking instead.');

  const existing = await db<BookingRow[]>`select * from provider_bookings where idempotency_key = ${args.idempotencyKey}`;
  if (existing[0]) return existing[0];

  const prep = await tx(async (t) => {
    const order = await lockOrder(t, args.orderId);
    if (order.fulfillmentType !== 'delivery' || ['cancelled', 'completed', 'pending_payment'].includes(order.status)) throw conflict('This order cannot be booked for delivery.');
    const f = await lockFulfillment(t, order.id);
    if (f.status !== 'unassigned') throw conflict('Remove the current rider/partner before booking a partner.');
    const live = await t`select id from provider_bookings where order_id = ${order.id} and status in ('requesting','unknown','requested','accepted','courier_assigned','picked_up','on_the_way')`;
    if (live.length) throw conflict('There is already a live partner booking for this order.', { code: 'live_booking' });
    const [b] = await t<BookingRow[]>`
      insert into provider_bookings (order_id, provider, idempotency_key, status, booked_by)
      values (${order.id}, ${adapter.key}, ${args.idempotencyKey}, 'requesting', ${actor.userId}) returning *`;
    const r = await getSettings('restaurant', t);
    return { order, f, booking: b, restaurant: { name: r.name, phone: r.phone, address: r.addressLine, lat: r.lat, lng: r.lng } };
  }, db);

  try {
    const res = await adapter.requestDelivery({
      idempotencyKey: args.idempotencyKey,
      orderNumber: prep.order.orderNumber,
      pickup: { name: prep.restaurant.name ?? 'Bite & Sips', phone: prep.restaurant.phone ?? '', address: prep.restaurant.address ?? '', lat: prep.restaurant.lat, lng: prep.restaurant.lng },
      dropoff: {
        name: prep.order.customerName,
        phone: prep.order.customerPhone,
        address: prep.f.addressLine ?? '',
        landmark: prep.f.landmark,
        lat: prep.f.lat,
        lng: prep.f.lng,
        instructions: prep.f.instructions,
      },
      valuePesewas: prep.order.subtotalPesewas,
    });
    await applyBookingResult(prep.booking.id, res, actor, db);
  } catch (e) {
    if (e instanceof PartnerUncertainError || (e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError') {
      await db`update provider_bookings set status = 'unknown', last_error = ${(e as Error).message}, updated_at = now() where id = ${prep.booking.id}`;
      await tx((t) => flagAttention(t, args.orderId, `Partner booking outcome unknown (${adapter.label}). Reconcile before booking again.`, actor), db);
    } else {
      await db`update provider_bookings set status = 'rejected', last_error = ${(e as Error).message.slice(0, 300)}, updated_at = now() where id = ${prep.booking.id}`;
      await tx((t) => flagAttention(t, args.orderId, `Partner booking failed (${adapter.label}): ${(e as Error).message}`, actor), db);
    }
    await tx(async (t) => signalOrder(t, await lockOrder(t, args.orderId)), db);
  }
  kickNotificationDispatch();
  return (await db<BookingRow[]>`select * from provider_bookings where id = ${prep.booking.id}`)[0];
}

async function applyBookingResult(bookingId: string, res: PartnerBookingResult, actor: Actor, db: Db) {
  await tx(async (t) => {
    const [b] = await t<BookingRow[]>`select * from provider_bookings where id = ${bookingId} for update`;
    const order = await lockOrder(t, b.orderId);
    let f = await lockFulfillment(t, b.orderId);
    if (res.status === 'rejected') {
      await t`update provider_bookings set status = 'rejected', external_id = ${res.externalId}, updated_at = now(), last_synced_at = now() where id = ${b.id}`;
      await flagAttention(t, order.id, `Delivery partner rejected the booking`, actor);
      await signalOrder(t, order);
      return;
    }
    await t`update provider_bookings set status = ${res.status}, external_id = ${res.externalId}, quoted_fee_pesewas = ${res.quotedFeePesewas},
              last_error = null, updated_at = now(), last_synced_at = now() where id = ${b.id}`;
    await t`update fulfillments set method = 'third_party', provider_name = ${b.provider}, external_ref = ${res.externalId},
              provider_fee_pesewas = ${res.quotedFeePesewas}, tracking_url = ${res.trackingUrl ?? null},
              courier_name = ${res.courierName ?? null}, courier_phone = ${res.courierPhone ?? null}, rider_user_id = null
            where order_id = ${order.id}`;
    const target = PARTNER_TO_FULFILLMENT[res.status] ?? 'requested';
    if (f.status === 'unassigned') f = await setFulfillmentStatus(t, f, 'requested', actor, { source: 'provider', message: `Booked with ${b.provider} (${res.externalId})` });
    if (target !== 'requested' && canTransition(DELIVERY_TRANSITIONS, f.status as DeliveryStatus, target)) {
      await setFulfillmentStatus(t, f, target, actor, { source: 'provider' });
    }
    await audit(t, actor, 'dispatch.partner_booked', 'order', order.id, { provider: b.provider, externalId: res.externalId });
    await signalOrder(t, order);
  }, db);
}

/** Resolve an 'unknown' booking: ask the partner (if supported) or let staff confirm what happened. */
export async function reconcileUnknownBooking(
  user: SessionUser | null,
  bookingId: string,
  manual?: { outcome: 'booked'; externalId: string; feePesewas?: number | null } | { outcome: 'not_booked' },
  db: Db = sql,
) {
  requirePerm(user, 'dispatch.manage');
  const actor = actorOf(user);
  const [b] = await db<BookingRow[]>`select * from provider_bookings where id = ${bookingId}`;
  if (!b) throw notFound('Booking');
  if (b.status !== 'unknown' && b.status !== 'requesting') throw conflict('This booking is not awaiting reconciliation.');
  const adapter = getPartnerAdapter(b.provider);
  if (!manual) {
    if (!adapter?.lookupByReference) throw invalid('This partner cannot be queried. Check the partner dashboard and confirm manually.');
    const found = await adapter.lookupByReference(b.idempotencyKey);
    if (found) return applyBookingResult(b.id, found, actor, db);
    manual = { outcome: 'not_booked' };
  }
  if (manual.outcome === 'booked') {
    if (!manual.externalId.trim()) throw invalid('Enter the partner reference.');
    return applyBookingResult(b.id, { externalId: manual.externalId.trim(), status: 'accepted', quotedFeePesewas: manual.feePesewas ?? null }, actor, db);
  }
  await tx(async (t) => {
    await t`update provider_bookings set status = 'cancelled', last_error = 'Confirmed not booked', updated_at = now() where id = ${b.id}`;
    await audit(t, actor, 'dispatch.partner_reconciled_not_booked', 'order', b.orderId, { bookingId });
    await signalOrder(t, await lockOrder(t, b.orderId));
  }, db);
}

/** Staff record a booking made by phone/app with a partner that has no API integration. */
export async function recordManualBooking(
  user: SessionUser | null,
  args: { orderId: string; providerName: string; externalRef?: string | null; feePesewas?: number | null; notes?: string | null; idempotencyKey: string },
  db: Db = sql,
) {
  requirePerm(user, 'dispatch.manage');
  if (!args.providerName?.trim()) throw invalid('Enter the delivery partner name.');
  const actor = actorOf(user);
  return tx(async (t) => {
    const dup = await t<BookingRow[]>`select * from provider_bookings where idempotency_key = ${args.idempotencyKey}`;
    if (dup[0]) return dup[0];
    const order = await lockOrder(t, args.orderId);
    if (order.fulfillmentType !== 'delivery' || ['cancelled', 'completed', 'pending_payment'].includes(order.status)) throw conflict('This order cannot be booked for delivery.');
    const f = await lockFulfillment(t, order.id);
    if (f.status !== 'unassigned') throw conflict('Remove the current rider/partner first.');
    const [b] = await t<BookingRow[]>`
      insert into provider_bookings (order_id, provider, idempotency_key, external_id, status, quoted_fee_pesewas, is_manual, notes, booked_by)
      values (${order.id}, ${args.providerName.trim()}, ${args.idempotencyKey}, ${args.externalRef?.trim() || null}, 'accepted',
              ${args.feePesewas ?? null}, true, ${args.notes ?? null}, ${actor.userId}) returning *`;
    await t`update fulfillments set method = 'manual_partner', provider_name = ${args.providerName.trim()}, external_ref = ${args.externalRef?.trim() || null},
              provider_fee_pesewas = ${args.feePesewas ?? null}, rider_user_id = null where order_id = ${order.id}`;
    await setFulfillmentStatus(t, f, 'assigned', actor, { source: 'manual', message: `Manually booked with ${args.providerName.trim()}` });
    await audit(t, actor, 'dispatch.manual_booking', 'order', order.id, { provider: args.providerName, externalRef: args.externalRef ?? null, feePesewas: args.feePesewas ?? null });
    await signalOrder(t, order);
    return b;
  }, db);
}

/** Apply a partner status (manual entry by staff, webhook, or polling). Out-of-order/regressive updates are ignored. */
async function applyPartnerStatus(
  t: Db,
  booking: BookingRow,
  status: PartnerStatus,
  actor: Actor,
  source: 'manual' | 'provider',
  extra: { courierName?: string | null; courierPhone?: string | null; trackingUrl?: string | null; finalFeePesewas?: number | null; note?: string | null } = {},
) {
  const order = await lockOrder(t, booking.orderId);
  let f = await lockFulfillment(t, booking.orderId);
  await t`update provider_bookings set status = ${status}, final_fee_pesewas = coalesce(${extra.finalFeePesewas ?? null}, final_fee_pesewas),
            last_synced_at = now(), updated_at = now() where id = ${booking.id}`;
  if (extra.courierName || extra.courierPhone || extra.trackingUrl) {
    await t`update fulfillments set courier_name = coalesce(${extra.courierName ?? null}, courier_name),
              courier_phone = coalesce(${extra.courierPhone ?? null}, courier_phone), tracking_url = coalesce(${extra.trackingUrl ?? null}, tracking_url)
            where order_id = ${order.id}`;
  }
  if (status === 'cancelled' || status === 'rejected') {
    if (['requested', 'assigned'].includes(f.status)) {
      await t`update fulfillments set method = null, provider_name = null, external_ref = null where order_id = ${order.id}`;
      await setFulfillmentStatus(t, f, 'unassigned', actor, { source, message: `Partner ${status} the delivery` });
      await flagAttention(t, order.id, `Delivery partner ${status} the booking — rebook or assign a rider`, actor);
    }
    await signalOrder(t, order);
    return;
  }
  const target = PARTNER_TO_FULFILLMENT[status];
  if (!target || f.status === target || !canTransition(DELIVERY_TRANSITIONS, f.status as DeliveryStatus, target)) {
    log.info('partner_status_ignored', { orderId: order.id, from: f.status, partnerStatus: status });
    await signalOrder(t, order);
    return;
  }
  if (target === 'picked_up' && order.kitchenStatus !== 'ready' && order.kitchenStatus !== 'handed_off') {
    await flagAttention(t, order.id, 'Partner reports pickup but the kitchen had not marked the order ready', actor);
  }
  f = await setFulfillmentStatus(t, f, target, actor, { source, message: extra.note ?? undefined });
  let o = order;
  if (target === 'picked_up' && ['ready', 'preparing', 'accepted', 'new'].includes(o.kitchenStatus)) {
    if (o.kitchenStatus === 'ready') o = await setKitchenStatus(t, o, 'handed_off', actor);
    await notifyOrder(t, o, 'out_for_delivery', 'out');
  }
  if (target === 'delivered') {
    await t`update fulfillments set pod_method = 'provider', pod_note = ${source === 'manual' ? 'Confirmed manually by staff' : 'Reported by partner'} where order_id = ${o.id}`;
    if (o.kitchenStatus === 'ready') o = await setKitchenStatus(t, o, 'handed_off', actor);
    if (o.status !== 'completed') o = await setOrderStatus(t, o, 'completed', actor);
    await t`update slot_reservations set released_at = coalesce(released_at, now()) where order_id = ${o.id}`;
    await notifyOrder(t, o, 'delivered', 'delivered');
  }
  if (target === 'failed') {
    await flagAttention(t, o.id, `Partner delivery failed${extra.note ? `: ${extra.note}` : ''}`, actor);
    await notifyOrder(t, o, 'delivery_failed', `failed:${f.version}`);
  }
  await signalOrder(t, o);
}

export async function updateManualBookingStatus(
  user: SessionUser | null,
  args: { orderId: string; status: 'courier_assigned' | 'picked_up' | 'on_the_way' | 'delivered' | 'failed' | 'cancelled'; note?: string | null; finalFeePesewas?: number | null; courierName?: string | null; courierPhone?: string | null },
  db: Db = sql,
) {
  requirePerm(user, 'dispatch.manage');
  const actor = actorOf(user);
  await tx(async (t) => {
    const [b] = await t<BookingRow[]>`
      select * from provider_bookings where order_id = ${args.orderId} and status not in ('rejected','cancelled','delivered','failed') order by created_at desc limit 1 for update`;
    if (!b) throw notFound('Active partner booking');
    if (!b.isManual && args.status !== 'cancelled') {
      // API partners: staff may still record a status (e.g. webhook missing) — it is labelled manual.
      await audit(t, actor, 'dispatch.partner_status_manual_override', 'order', args.orderId, { status: args.status });
    }
    await applyPartnerStatus(t, b, args.status, actor, 'manual', args);
  }, db);
  kickNotificationDispatch();
}

export async function cancelPartnerBooking(user: SessionUser | null, orderId: string, reason: string, db: Db = sql) {
  requirePerm(user, 'dispatch.manage');
  if (!reason?.trim()) throw invalid('A reason is required.');
  const actor = actorOf(user);
  const [b] = await db<BookingRow[]>`
    select * from provider_bookings where order_id = ${orderId} and status in ('requesting','unknown','requested','accepted','courier_assigned') order by created_at desc limit 1`;
  if (!b) {
    const moving = await db`select 1 from provider_bookings where order_id = ${orderId} and status in ('picked_up','on_the_way')`;
    if (moving.length) throw conflict('The courier has already picked up this order. Record the outcome (delivered / failed) instead.');
    throw notFound('Active partner booking');
  }
  const adapter = b.isManual ? null : getPartnerAdapter(b.provider);
  if (adapter && b.externalId) {
    if (!adapter.cancel) throw conflict('This partner does not support cancellation through the API. Cancel with the partner directly, then record it.');
    try {
      const r = await adapter.cancel(b.externalId);
      if (!r.cancelled) throw new Error(r.detail ?? 'Partner refused cancellation');
    } catch (e) {
      await db`update provider_bookings set status = 'cancel_failed', last_error = ${(e as Error).message.slice(0, 300)}, updated_at = now() where id = ${b.id}`;
      await tx((t) => flagAttention(t, orderId, `Partner cancellation failed: ${(e as Error).message}`, actor), db);
      throw conflict(`The partner did not confirm the cancellation: ${(e as Error).message}`);
    }
  }
  await tx(async (t) => {
    const [locked] = await t<BookingRow[]>`select * from provider_bookings where id = ${b.id} for update`;
    await applyPartnerStatus(t, locked, 'cancelled', actor, b.isManual ? 'manual' : 'provider', { note: reason });
    await t`update orders set needs_attention = false, attention_reason = null where id = ${orderId} and attention_reason like 'Delivery partner cancelled%'`;
    await audit(t, actor, 'dispatch.partner_cancelled', 'order', orderId, { reason, bookingId: b.id });
  }, db);
}

export async function reconcileBookingFee(user: SessionUser | null, bookingId: string, finalFeePesewas: number, db: Db = sql) {
  requirePerm(user, 'finance.view');
  if (!Number.isSafeInteger(finalFeePesewas) || finalFeePesewas < 0) throw invalid('Invalid fee.');
  const actor = actorOf(user);
  await tx(async (t) => {
    const [b] = await t<BookingRow[]>`select * from provider_bookings where id = ${bookingId} for update`;
    if (!b) throw notFound('Booking');
    await t`update provider_bookings set final_fee_pesewas = ${finalFeePesewas}, reconciled_at = now(), updated_at = now() where id = ${bookingId}`;
    await t`update fulfillments set provider_fee_pesewas = ${finalFeePesewas} where order_id = ${b.orderId}`;
    await audit(t, actor, 'dispatch.partner_fee_reconciled', 'provider_booking', bookingId, { finalFeePesewas, quoted: b.quotedFeePesewas });
  }, db);
}

/** Partner webhook entry point: signature check → dedupe → apply status. */
export async function handlePartnerWebhook(key: string, rawBody: string, headers: Headers, db: Db = sql) {
  const adapter = getPartnerAdapter(key);
  if (!adapter?.verifyWebhook || !adapter.parseWebhook) return { httpStatus: 404, body: { error: 'unknown partner' } };
  if (!adapter.verifyWebhook(rawBody, headers)) return { httpStatus: 401, body: { error: 'invalid signature' } };
  let ev;
  try {
    ev = adapter.parseWebhook(rawBody);
  } catch {
    return { httpStatus: 400, body: { error: 'malformed' } };
  }
  const provider = `partner:${key}`;
  const ins = await db<{ id: string }[]>`
    insert into webhook_events (provider, dedupe_key, event_type, signature_valid, payload)
    values (${provider}, ${ev.eventId}, ${ev.status}, true, ${db.json(JSON.parse(rawBody) as never)})
    on conflict (provider, dedupe_key) do nothing returning id`;
  if (!ins.length) {
    const [prev] = await db<{ processedAt: Date | null }[]>`select processed_at from webhook_events where provider = ${provider} and dedupe_key = ${ev.eventId}`;
    if (prev?.processedAt) return { httpStatus: 200, body: { ok: true, duplicate: true } };
  }
  try {
    await tx(async (t) => {
      const [b] = await t<BookingRow[]>`select * from provider_bookings where provider = ${key} and external_id = ${ev.externalId} for update`;
      if (!b) throw notFound('Booking');
      if (['delivered', 'cancelled', 'rejected'].includes(b.status)) return;
      await applyPartnerStatus(t, b, ev.status, { userId: null, label: provider }, 'provider', ev);
    }, db);
    await db`update webhook_events set processed_at = now() where provider = ${provider} and dedupe_key = ${ev.eventId}`;
    kickNotificationDispatch();
    return { httpStatus: 200, body: { ok: true } };
  } catch (e) {
    await db`update webhook_events set processing_error = ${(e as Error).message.slice(0, 300)} where provider = ${provider} and dedupe_key = ${ev.eventId}`;
    return { httpStatus: 500, body: { error: 'processing failed' } };
  }
}

export async function bookingsForOrder(orderId: string, db: Db = sql) {
  return db<BookingRow[]>`select * from provider_bookings where order_id = ${orderId} order by created_at desc`;
}
