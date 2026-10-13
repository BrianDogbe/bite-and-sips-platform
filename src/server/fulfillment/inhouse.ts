import 'server-only';
import { sql, tx, type Db } from '../db';
import { env } from '../env';
import { conflict, forbidden, invalid, notFound, DomainError } from '../errors';
import { audit, type Actor } from '../audit';
import { hmacHex, safeEqualStr } from '../ids';
import { requirePerm, requireAnyPerm, actorOf } from '../auth/guard';
import type { SessionUser } from '../auth/sessions';
import { enforceRateLimit } from '../auth/rate-limit';
import { getSettings, type DeliverySettings } from '../settings';
import { notifyOrder, kickNotificationDispatch } from '../notifications';
import {
  lockOrder,
  lockFulfillment,
  setFulfillmentStatus,
  setKitchenStatus,
  setOrderStatus,
  flagAttention,
  recordEvent,
  signalOrder,
  type FulfillmentRow,
} from '../orders/core';
import { LOCATION_SHARING_STATUSES, type DeliveryStatus } from '@/lib/states';
import { locationUpdateSchema } from '@/lib/validation';
import { localParts, zonedToUtc } from '@/lib/time';

// ---------------------------------------------------------------------------
// Proof-of-delivery PIN
// ---------------------------------------------------------------------------

/**
 * 4-digit delivery PIN derived from the order id with a server secret (HMAC), so it never needs
 * to be stored. Shown only on the customer's tracking page (secret link); the rider must enter it.
 * Brute force is limited by `pinMaxAttempts`, after which the delivery locks and dispatch must
 * use an authorised override.
 */
export function deliveryPin(orderId: string): string {
  const h = hmacHex(env().APP_SECRET, `delivery-pin:${orderId}`);
  return String(parseInt(h.slice(0, 8), 16) % 10000).padStart(4, '0');
}

// ---------------------------------------------------------------------------
// Rider availability
// ---------------------------------------------------------------------------

export interface RiderStatus {
  userId: string;
  fullName: string;
  phone: string | null;
  vehicleType: string;
  vehiclePlate: string | null;
  isOnDuty: boolean;
  lastHeartbeatAt: Date | null;
  lastLat: number | null;
  lastLng: number | null;
  lastLocationAt: Date | null;
  activeDeliveries: number;
  online: boolean;
  locationStale: boolean;
}

/** A rider is online only if on duty AND their app sent a heartbeat recently. Never trust an old session. */
export function isRiderOnline(r: { isOnDuty: boolean; lastHeartbeatAt: Date | null }, s: Pick<DeliverySettings, 'riderOnlineWindowSeconds'>, now = new Date()) {
  return r.isOnDuty && !!r.lastHeartbeatAt && now.getTime() - new Date(r.lastHeartbeatAt).getTime() <= s.riderOnlineWindowSeconds * 1000;
}

export function isLocationStale(at: Date | null, s: Pick<DeliverySettings, 'locationStaleSeconds'>, now = new Date()) {
  return !at || now.getTime() - new Date(at).getTime() > s.locationStaleSeconds * 1000;
}

export async function listRiders(db: Db = sql): Promise<RiderStatus[]> {
  const s = await getSettings('delivery', db);
  const rows = await db<Omit<RiderStatus, 'online' | 'locationStale'>[]>`
    select u.id as user_id, u.full_name, u.phone, coalesce(rp.vehicle_type, 'motorbike') as vehicle_type, rp.vehicle_plate,
           coalesce(rp.is_on_duty, false) as is_on_duty, rp.last_heartbeat_at, rp.last_lat, rp.last_lng, rp.last_location_at,
           (select count(*)::int from delivery_assignments da where da.rider_user_id = u.id and da.status in ('offered','accepted')) as active_deliveries
    from users u join user_roles r on r.user_id = u.id and r.role = 'rider'
    left join rider_profiles rp on rp.user_id = u.id
    where u.is_active
    order by u.full_name`;
  return rows.map((r) => ({ ...r, online: isRiderOnline(r, s), locationStale: isLocationStale(r.lastLocationAt, s) }));
}

export async function riderHeartbeat(user: SessionUser | null, onDuty: boolean, db: Db = sql) {
  requirePerm(user, 'rider.deliver');
  await db`
    insert into rider_profiles (user_id, is_on_duty, last_heartbeat_at) values (${user!.id}, ${onDuty}, now())
    on conflict (user_id) do update set is_on_duty = excluded.is_on_duty, last_heartbeat_at = now()`;
  if (!onDuty) {
    // Going off duty stops location sharing; clear the last precise position from the live view.
    await db`update rider_profiles set last_lat = null, last_lng = null, last_accuracy_m = null where user_id = ${user!.id}`;
  }
  await db`select pg_notify('bs_events', ${JSON.stringify({ topic: 'dispatch' })})`;
}

// ---------------------------------------------------------------------------
// Dispatch: assign / reassign
// ---------------------------------------------------------------------------

function ensureDeliverableOrder(o: { status: string; fulfillmentType: string; paymentStatus: string }) {
  if (o.fulfillmentType !== 'delivery') throw invalid('Not a delivery order.');
  if (o.status === 'pending_payment') throw conflict('This order is not paid yet.');
  if (o.status === 'cancelled' || o.status === 'completed') throw conflict(`Order is already ${o.status}.`);
}

export async function assignRider(
  user: SessionUser | null,
  args: { orderId: string; riderUserId: string; riderFeePesewas?: number | null; allowOffline?: boolean; reason?: string },
  db: Db = sql,
) {
  requireAnyPerm(user, ['dispatch.manage', 'dispatch.assign']);
  // Only dispatch managers may send an offline rider or set a custom fee; kitchen staff pick from online riders.
  if (!user!.permissions.has('dispatch.manage') && (args.allowOffline || args.riderFeePesewas != null)) throw forbidden();
  const actor = actorOf(user);
  const s = await getSettings('delivery', db);
  const res = await tx(async (t) => {
    const order = await lockOrder(t, args.orderId);
    ensureDeliverableOrder(order);
    let f = await lockFulfillment(t, order.id);
    const [rider] = await t<{ id: string; fullName: string; isOnDuty: boolean | null; lastHeartbeatAt: Date | null }[]>`
      select u.id, u.full_name, rp.is_on_duty, rp.last_heartbeat_at
      from users u join user_roles r on r.user_id = u.id and r.role = 'rider'
      left join rider_profiles rp on rp.user_id = u.id
      where u.id = ${args.riderUserId} and u.is_active`;
    if (!rider) throw notFound('Rider');
    const online = isRiderOnline({ isOnDuty: !!rider.isOnDuty, lastHeartbeatAt: rider.lastHeartbeatAt }, s);
    if (!online && !args.allowOffline) {
      throw conflict(`${rider.fullName} is not online right now (no recent activity from their app).`, { code: 'rider_offline' });
    }
    if (['assigned', 'accepted', 'at_restaurant'].includes(f.status)) {
      // Reassignment: end the current live assignment first.
      await endLiveAssignment(t, order.id, 'cancelled', args.reason || 'Reassigned by dispatch');
      f = await setFulfillmentStatus(t, f, 'unassigned', actor, { message: args.reason || 'Reassigned' });
    }
    if (f.status === 'requested') throw conflict('A delivery partner booking is in progress. Cancel it before assigning a rider.');
    if (f.status !== 'unassigned') throw conflict(`Cannot assign a rider while delivery is "${f.status}".`);

    await t`
      insert into delivery_assignments (order_id, rider_user_id, status, assigned_by, rider_fee_pesewas)
      values (${order.id}, ${rider.id}, 'offered', ${actor.userId}, ${args.riderFeePesewas ?? s.defaultRiderFeePesewas})`;
    await t`update fulfillments set method = 'in_house', rider_user_id = ${rider.id}, provider_name = null, external_ref = null where order_id = ${order.id}`;
    f = await setFulfillmentStatus(t, { ...f, method: 'in_house' }, 'assigned', actor, {
      message: `Assigned to ${rider.fullName}${online ? '' : ' (rider was offline)'}`,
      data: { riderUserId: rider.id },
    });
    await audit(t, actor, 'dispatch.assigned', 'order', order.id, { riderUserId: rider.id, allowOffline: !!args.allowOffline });
    await signalOrder(t, order, [`rider:${rider.id}`]);
    return f;
  }, db);
  return res;
}

async function endLiveAssignment(t: Db, orderId: string, status: 'cancelled' | 'declined' | 'completed' | 'failed', reason: string) {
  const rows = await t<{ riderUserId: string }[]>`
    update delivery_assignments set status = ${status}, ended_at = now(), end_reason = ${reason},
      responded_at = coalesce(responded_at, case when ${status} = 'declined' then now() else null end)
    where order_id = ${orderId} and status in ('offered','accepted') returning rider_user_id`;
  return rows[0]?.riderUserId ?? null;
}

export async function unassignRider(user: SessionUser | null, orderId: string, reason: string, db: Db = sql) {
  requirePerm(user, 'dispatch.manage');
  if (!reason?.trim()) throw invalid('A reason is required.');
  const actor = actorOf(user);
  return tx(async (t) => {
    const order = await lockOrder(t, orderId);
    const f = await lockFulfillment(t, orderId);
    if (!['assigned', 'accepted', 'at_restaurant'].includes(f.status) || f.method !== 'in_house') {
      throw conflict('Only rider assignments that have not been picked up can be removed.');
    }
    const rider = await endLiveAssignment(t, orderId, 'cancelled', reason);
    await t`update fulfillments set rider_user_id = null where order_id = ${orderId}`;
    await setFulfillmentStatus(t, f, 'unassigned', actor, { message: reason });
    await audit(t, actor, 'dispatch.unassigned', 'order', orderId, { reason, riderUserId: rider });
    await signalOrder(t, order, rider ? [`rider:${rider}`] : []);
  }, db);
}

// ---------------------------------------------------------------------------
// Rider workflow
// ---------------------------------------------------------------------------

async function lockRiderDelivery(t: Db, user: SessionUser, orderId: string) {
  const order = await lockOrder(t, orderId);
  const f = await lockFulfillment(t, orderId);
  if (f.method !== 'in_house' || f.riderUserId !== user.id) throw forbidden('This delivery is not assigned to you.');
  return { order, f };
}

export async function riderRespond(user: SessionUser | null, orderId: string, response: 'accept' | 'decline', reason: string | null, db: Db = sql) {
  requirePerm(user, 'rider.deliver');
  const actor = actorOf(user);
  const res = await tx(async (t) => {
    const { order, f } = await lockRiderDelivery(t, user!, orderId);
    const [a] = await t<{ id: string; status: string }[]>`
      select id, status from delivery_assignments where order_id = ${orderId} and rider_user_id = ${user!.id} and status in ('offered','accepted') for update`;
    if (!a) throw conflict('This assignment is no longer active.');
    if (response === 'accept') {
      if (a.status === 'accepted') throw conflict('You already accepted this delivery.', { code: 'already_in_state' });
      await t`update delivery_assignments set status = 'accepted', responded_at = now() where id = ${a.id}`;
      await setFulfillmentStatus(t, f, 'accepted', actor, { message: `${user!.fullName} accepted` });
      await notifyOrder(t, order, 'rider_assigned', a.id);
    } else {
      if (!reason?.trim()) throw invalid('Please give a reason for declining.');
      if (a.status !== 'offered') throw conflict('You have already accepted this delivery. Ask the restaurant to reassign it.');
      await endLiveAssignment(t, orderId, 'declined', reason);
      await t`update fulfillments set rider_user_id = null where order_id = ${orderId}`;
      await setFulfillmentStatus(t, f, 'unassigned', actor, { message: `Declined by ${user!.fullName}: ${reason}` });
    }
    await signalOrder(t, order, [`rider:${user!.id}`]);
    return response;
  }, db);
  kickNotificationDispatch();
  return res;
}

export async function riderAdvance(user: SessionUser | null, orderId: string, to: 'at_restaurant' | 'picked_up' | 'on_the_way' | 'arrived', db: Db = sql) {
  requirePerm(user, 'rider.deliver');
  const actor = actorOf(user);
  const res = await tx(async (t) => {
    let { order, f } = await lockRiderDelivery(t, user!, orderId);
    if (order.status === 'cancelled') throw conflict('This order was cancelled. Return to the restaurant.');
    if (to === 'picked_up') {
      if (order.kitchenStatus !== 'ready') throw conflict('The kitchen has not marked this order ready yet.', { code: 'not_ready' });
      if (!['paid', 'cash_due', 'cash_collected', 'partially_refunded'].includes(order.paymentStatus)) throw conflict('Payment is not confirmed for this order.');
      if (f.status === 'assigned') {
        await t`update delivery_assignments set status = 'accepted', responded_at = coalesce(responded_at, now())
                where order_id = ${orderId} and rider_user_id = ${user!.id} and status = 'offered'`;
      }
    }
    f = await setFulfillmentStatus(t, f, to, actor);
    if (to === 'picked_up') {
      order = await setKitchenStatus(t, order, 'handed_off', actor, `Collected by ${user!.fullName}`);
      if (order.status === 'placed') order = await setOrderStatus(t, order, 'in_progress', actor);
    }
    if (to === 'picked_up' || to === 'on_the_way') await notifyOrder(t, order, 'out_for_delivery', 'out');
    await signalOrder(t, order, [`rider:${user!.id}`]);
    return f;
  }, db);
  kickNotificationDispatch();
  return res;
}

async function completeDelivery(t: Db, order: Awaited<ReturnType<typeof lockOrder>>, f: FulfillmentRow, actor: Actor, pod: { method: 'pin' | 'override' | 'provider'; note?: string | null }) {
  await setFulfillmentStatus(t, f, 'delivered', actor, { message: pod.note ?? undefined, source: pod.method === 'provider' ? 'manual' : 'system' });
  await t`update fulfillments set pod_method = ${pod.method}, pod_by = ${actor.userId}, pod_note = ${pod.note ?? null} where order_id = ${order.id}`;
  await endLiveAssignment(t, order.id, 'completed', 'delivered');
  let o = order;
  if (o.kitchenStatus === 'ready') o = await setKitchenStatus(t, o, 'handed_off', actor);
  o = await setOrderStatus(t, o, 'completed', actor);
  await t`update slot_reservations set released_at = coalesce(released_at, now()) where order_id = ${o.id}`;
  await notifyOrder(t, o, 'delivered', 'delivered');
  await signalOrder(t, o, f.riderUserId ? [`rider:${f.riderUserId}`] : []);
  return o;
}

/** Rider enters the customer's PIN at handoff. Cash-on-delivery must be recorded first. */
export async function confirmDeliveryWithPin(user: SessionUser | null, orderId: string, pin: string, db: Db = sql) {
  requirePerm(user, 'rider.deliver');
  await enforceRateLimit(`pin:${user!.id}:${orderId}`, 20, 15 * 60, db);
  const actor = actorOf(user);
  const s = await getSettings('delivery', db);
  const outcome = await tx(async (t) => {
    const { order, f } = await lockRiderDelivery(t, user!, orderId);
    if (!['picked_up', 'on_the_way', 'arrived'].includes(f.status)) throw conflict('Mark the order as picked up first.');
    if (f.pinLocked) throw new DomainError('pin_locked', 'Too many incorrect PINs. Ask the restaurant to confirm the delivery.', 423);
    if (order.paymentStatus === 'cash_due') throw conflict('Record the cash payment before completing the delivery.', { code: 'cash_due' });
    const ok = /^\d{4}$/.test(pin) && safeEqualStr(pin, deliveryPin(order.id));
    if (!ok) {
      const attempts = f.pinAttempts + 1;
      const locked = attempts >= s.pinMaxAttempts;
      await t`update fulfillments set pin_attempts = ${attempts}, pin_locked = ${locked} where order_id = ${order.id}`;
      await recordEvent(t, order.id, actor, { domain: 'fulfillment', type: 'pod.pin_failed', message: `Incorrect PIN (${attempts}/${s.pinMaxAttempts})` });
      if (locked) await flagAttention(t, order.id, 'Delivery PIN locked after repeated incorrect attempts', actor);
      await signalOrder(t, order);
      return { ok: false as const, remaining: Math.max(0, s.pinMaxAttempts - attempts), locked };
    }
    await completeDelivery(t, order, f, actor, { method: 'pin' });
    return { ok: true as const };
  }, db);
  kickNotificationDispatch();
  if (!outcome.ok) {
    throw new DomainError(outcome.locked ? 'pin_locked' : 'pin_incorrect', outcome.locked ? 'Too many incorrect PINs. Ask the restaurant to confirm the delivery.' : `Incorrect PIN. ${outcome.remaining} attempt(s) left.`, outcome.locked ? 423 : 422);
  }
  return outcome;
}

/** Authorised exception: owner/manager confirms delivery without the PIN (reason recorded). */
export async function overrideDelivery(user: SessionUser | null, orderId: string, reason: string, db: Db = sql) {
  requirePerm(user, 'dispatch.manage');
  if (!reason?.trim() || reason.trim().length < 5) throw invalid('Explain why the delivery is being confirmed without a PIN.');
  const actor = actorOf(user);
  const res = await tx(async (t) => {
    const order = await lockOrder(t, orderId);
    const f = await lockFulfillment(t, orderId);
    if (f.method !== 'in_house') throw conflict('Use the partner status controls for partner deliveries.');
    if (!['picked_up', 'on_the_way', 'arrived', 'failed'].includes(f.status)) throw conflict('The order has not been picked up.');
    if (order.paymentStatus === 'cash_due') throw conflict('Record the cash payment first.');
    await audit(t, actor, 'delivery.override', 'order', orderId, { reason });
    return completeDelivery(t, order, f, actor, { method: 'override', note: reason.trim() });
  }, db);
  kickNotificationDispatch();
  return res;
}

export async function failDelivery(user: SessionUser | null, orderId: string, reason: string, db: Db = sql) {
  if (!reason?.trim()) throw invalid('A reason is required.');
  const isDispatchManager = !!user?.permissions.has('dispatch.manage');
  if (!isDispatchManager) requirePerm(user, 'rider.deliver');
  const actor = actorOf(user);
  const res = await tx(async (t) => {
    const order = await lockOrder(t, orderId);
    const f = await lockFulfillment(t, orderId);
    if (!isDispatchManager && (f.method !== 'in_house' || f.riderUserId !== user!.id)) throw forbidden('This delivery is not assigned to you.');
    if (!['picked_up', 'on_the_way', 'arrived'].includes(f.status)) throw conflict('Only deliveries in progress can be marked failed.');
    await setFulfillmentStatus(t, f, 'failed', actor, { message: reason });
    await t`update fulfillments set failure_reason = ${reason} where order_id = ${orderId}`;
    await endLiveAssignment(t, orderId, 'failed', reason);
    await flagAttention(t, orderId, `Delivery failed: ${reason}`, actor);
    await notifyOrder(t, order, 'delivery_failed', `failed:${f.version}`);
    await signalOrder(t, order, f.riderUserId ? [`rider:${f.riderUserId}`] : []);
  }, db);
  kickNotificationDispatch();
  return res;
}

/** After a failed delivery: food came back (returned) or try again (back to dispatch). */
export async function resolveFailedDelivery(user: SessionUser | null, orderId: string, next: 'returned' | 'unassigned', note: string, db: Db = sql) {
  requirePerm(user, 'dispatch.manage');
  const actor = actorOf(user);
  return tx(async (t) => {
    const order = await lockOrder(t, orderId);
    const f = await lockFulfillment(t, orderId);
    if (!['failed', 'returned'].includes(f.status)) throw conflict('Delivery is not in a failed state.');
    await setFulfillmentStatus(t, f, next, actor, { message: note });
    if (next === 'unassigned') await t`update fulfillments set rider_user_id = null, pin_attempts = 0, pin_locked = false where order_id = ${orderId}`;
    await audit(t, actor, `delivery.${next}`, 'order', orderId, { note });
    await signalOrder(t, order);
  }, db);
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

/**
 * Rider location update. Accepted only while the rider is on duty AND has an accepted, active
 * delivery (business policy: no tracking outside deliveries). Coordinates and timestamps are validated.
 */
export async function recordRiderLocation(user: SessionUser | null, raw: unknown, now = new Date(), db: Db = sql) {
  requirePerm(user, 'rider.deliver');
  const parsed = locationUpdateSchema.safeParse(raw);
  if (!parsed.success) throw invalid('Invalid location.');
  const loc = parsed.data;
  const recordedAt = new Date(loc.recordedAt);
  if (recordedAt.getTime() > now.getTime() + 60_000) throw invalid('Location timestamp is in the future.');
  if (now.getTime() - recordedAt.getTime() > 10 * 60_000) throw invalid('Location is too old to be useful.', { code: 'too_old' });
  if (loc.lat === 0 && loc.lng === 0) throw invalid('Invalid coordinates.');
  await enforceRateLimit(`loc:${user!.id}`, 30, 60, db);

  const active = await db<{ orderId: string; status: DeliveryStatus }[]>`
    select f.order_id, f.status from fulfillments f
    join delivery_assignments a on a.order_id = f.order_id and a.rider_user_id = ${user!.id} and a.status = 'accepted'
    where f.rider_user_id = ${user!.id} and f.method = 'in_house'
      and f.status in ('accepted','at_restaurant','picked_up','on_the_way','arrived')`;
  const [profile] = await db<{ isOnDuty: boolean }[]>`select is_on_duty from rider_profiles where user_id = ${user!.id}`;
  if (!profile?.isOnDuty) throw conflict('Go on duty to share your location.', { code: 'off_duty' });
  if (!active.length) return { accepted: false, reason: 'no_active_delivery' as const };

  await tx(async (t) => {
    for (const a of active) {
      await t`insert into rider_locations (rider_user_id, order_id, lat, lng, accuracy_m, recorded_at)
              values (${user!.id}, ${a.orderId}, ${loc.lat}, ${loc.lng}, ${loc.accuracy ?? null}, ${recordedAt})`;
      await t`select pg_notify('bs_events', ${JSON.stringify({ topic: `order:${a.orderId}`, kind: 'location' })})`;
    }
    await t`update rider_profiles set last_lat = ${loc.lat}, last_lng = ${loc.lng}, last_accuracy_m = ${loc.accuracy ?? null},
              last_location_at = ${recordedAt}, last_heartbeat_at = now() where user_id = ${user!.id}`;
    await t`select pg_notify('bs_events', ${JSON.stringify({ topic: 'dispatch', kind: 'location' })})`;
  }, db);
  return { accepted: true as const };
}

/** Location for the customer's tracking page — only during the active delivery leg, with staleness. */
export async function customerVisibleLocation(orderId: string, db: Db = sql) {
  const [f] = await db<{ status: DeliveryStatus; method: string | null; riderUserId: string | null }[]>`
    select status, method, rider_user_id from fulfillments where order_id = ${orderId} and type = 'delivery'`;
  if (!f || f.method !== 'in_house' || !f.riderUserId || !LOCATION_SHARING_STATUSES.includes(f.status)) return null;
  const [loc] = await db<{ lat: number; lng: number; accuracyM: number | null; recordedAt: Date }[]>`
    select lat, lng, accuracy_m, recorded_at from rider_locations
    where order_id = ${orderId} and rider_user_id = ${f.riderUserId} order by recorded_at desc limit 1`;
  if (!loc) return { available: false as const };
  const s = await getSettings('delivery', db);
  return { available: true as const, lat: loc.lat, lng: loc.lng, accuracyM: loc.accuracyM, recordedAt: loc.recordedAt, stale: isLocationStale(loc.recordedAt, s) };
}

export async function purgeOldLocations(db: Db = sql) {
  const s = await getSettings('delivery', db);
  const r = await db`delete from rider_locations where received_at < now() - make_interval(days => ${s.locationRetentionDays})`;
  return { deleted: r.count };
}

// ---------------------------------------------------------------------------
// Rider views
// ---------------------------------------------------------------------------

export async function riderAssignments(user: SessionUser | null, db: Db = sql) {
  requirePerm(user, 'rider.deliver');
  const restaurant = await getSettings('restaurant', db);
  const rows = await db<
    {
      orderId: string;
      orderNumber: string;
      assignmentStatus: string;
      riderFeePesewas: number | null;
      fulfillmentStatus: DeliveryStatus;
      kitchenStatus: string;
      paymentStatus: string;
      paymentMethod: string;
      totalPesewas: number;
      customerName: string;
      customerPhone: string;
      addressLine: string | null;
      landmark: string | null;
      instructions: string | null;
      lat: number | null;
      lng: number | null;
      locationVerified: boolean;
      zoneName: string | null;
      promisedAt: Date;
      assignedAt: Date;
      pinLocked: boolean;
      itemCount: number;
    }[]
  >`
    select o.id as order_id, o.order_number, a.status as assignment_status, a.rider_fee_pesewas, f.status as fulfillment_status,
           o.kitchen_status, o.payment_status, o.payment_method, o.total_pesewas,
           o.customer_name, o.customer_phone, f.address_line, f.landmark, f.instructions, f.lat, f.lng, f.location_verified, f.zone_name,
           o.promised_at, a.assigned_at, f.pin_locked,
           (select coalesce(sum(quantity),0)::int from order_items oi where oi.order_id = o.id) as item_count
    from delivery_assignments a
    join orders o on o.id = a.order_id
    join fulfillments f on f.order_id = o.id and f.rider_user_id = a.rider_user_id
    where a.rider_user_id = ${user!.id} and a.status in ('offered','accepted')
    order by a.assigned_at`;
  return {
    restaurant: { name: restaurant.name, addressLine: restaurant.addressLine, lat: restaurant.lat, lng: restaurant.lng, phone: restaurant.phone, whatsapp: restaurant.whatsapp },
    assignments: rows.map((r) => ({
      ...r,
      // Contact details are only needed once the rider has accepted.
      customerPhone: r.assignmentStatus === 'accepted' ? r.customerPhone : null,
      lat: r.assignmentStatus === 'accepted' ? r.lat : null,
      lng: r.assignmentStatus === 'accepted' ? r.lng : null,
      addressLine: r.assignmentStatus === 'accepted' ? r.addressLine : null,
      instructions: r.assignmentStatus === 'accepted' ? r.instructions : null,
      landmark: r.assignmentStatus === 'accepted' ? r.landmark : null,
      cashToCollectPesewas: r.paymentStatus === 'cash_due' ? r.totalPesewas : 0,
    })),
  };
}

export async function riderHistory(user: SessionUser | null, db: Db = sql) {
  requirePerm(user, 'rider.deliver');
  return db<{ orderNumber: string; status: string; endReason: string | null; assignedAt: Date; endedAt: Date | null; riderFeePesewas: number | null; zoneName: string | null }[]>`
    select o.order_number, a.status, a.end_reason, a.assigned_at, a.ended_at, a.rider_fee_pesewas, f.zone_name
    from delivery_assignments a join orders o on o.id = a.order_id join fulfillments f on f.order_id = o.id
    where a.rider_user_id = ${user!.id} and a.status not in ('offered','accepted')
    order by a.assigned_at desc limit 50`;
}

// ---------------------------------------------------------------------------
// Rider app extras: earnings, cash to hand in, profile
// ---------------------------------------------------------------------------

export const VEHICLE_TYPES = ['motorbike', 'bicycle', 'car', 'on_foot'] as const;

async function cashHeld(riderId: string, db: Db): Promise<{ collectedPesewas: number; handedInPesewas: number }> {
  const [c] = await db<{ n: number }[]>`
    select coalesce(sum(amount_pesewas),0)::int as n from payment_attempts
    where provider = 'cash' and status = 'successful' and collected_by = ${riderId}`;
  const [h] = await db<{ n: number }[]>`select coalesce(sum(amount_pesewas),0)::int as n from rider_cash_handovers where rider_user_id = ${riderId}`;
  return { collectedPesewas: c.n, handedInPesewas: h.n };
}

/** Start of today / this week (Monday) / this month in the restaurant's timezone, as UTC instants. */
function periodStarts(tz: string, now = new Date()) {
  const p = localParts(now, tz);
  const today = zonedToUtc(p.year, p.month, p.day, 0, 0, tz);
  const mondayNoon = new Date(today.getTime() - ((p.weekday + 6) % 7) * 86400000 + 12 * 3600000);
  const m = localParts(mondayNoon, tz);
  return { today, week: zonedToUtc(m.year, m.month, m.day, 0, 0, tz), month: zonedToUtc(p.year, p.month, 1, 0, 0, tz) };
}

export async function riderStats(user: SessionUser | null, db: Db = sql) {
  requirePerm(user, 'rider.deliver');
  const tz = (await getSettings('restaurant', db)).timezone;
  const st = periodStarts(tz);
  const period = async (from: Date) => {
    const [r] = await db<{ n: number; fee: number }[]>`
      select count(*)::int as n, coalesce(sum(rider_fee_pesewas),0)::int as fee
      from delivery_assignments where rider_user_id = ${user!.id} and status = 'completed' and ended_at >= ${from}`;
    return { deliveries: r.n, feePesewas: r.fee };
  };
  const [today, week, month] = await Promise.all([period(st.today), period(st.week), period(st.month)]);
  const held = await cashHeld(user!.id, db);
  const [ct] = await db<{ n: number }[]>`
    select coalesce(sum(amount_pesewas),0)::int as n from payment_attempts
    where provider = 'cash' and status = 'successful' and collected_by = ${user!.id} and paid_at >= ${st.today}`;
  const [prof] = await db<{ fullName: string; phone: string | null; email: string | null; vehicleType: string | null; vehiclePlate: string | null; memberSince: Date; lastLoginAt: Date | null }[]>`
    select u.full_name, u.phone, u.email, rp.vehicle_type, rp.vehicle_plate, u.created_at as member_since, u.last_login_at
    from users u left join rider_profiles rp on rp.user_id = u.id where u.id = ${user!.id}`;
  const [life] = await db<{ completed: number; fee: number; failed: number; declined: number; avgSeconds: number | null }[]>`
    select count(*) filter (where status = 'completed')::int as completed,
           coalesce(sum(rider_fee_pesewas) filter (where status = 'completed'),0)::int as fee,
           count(*) filter (where status = 'failed')::int as failed,
           count(*) filter (where status = 'declined')::int as declined,
           (avg(extract(epoch from (ended_at - assigned_at))) filter (where status = 'completed'))::float as avg_seconds
    from delivery_assignments where rider_user_id = ${user!.id}`;
  const attempted = life.completed + life.failed;
  return {
    today,
    week,
    month,
    cashCollectedTodayPesewas: ct.n,
    cashToHandInPesewas: Math.max(0, held.collectedPesewas - held.handedInPesewas),
    profile: { ...prof, vehicleType: prof?.vehicleType ?? 'motorbike' },
    lifetime: {
      deliveries: life.completed,
      feePesewas: life.fee,
      failed: life.failed,
      declined: life.declined,
      completionRate: attempted ? Math.round((life.completed / attempted) * 100) : null,
      avgMinutes: life.avgSeconds != null ? Math.round(life.avgSeconds / 60) : null,
    },
  };
}

export async function updateRiderVehicle(user: SessionUser | null, args: { vehicleType: string; vehiclePlate?: string | null }, db: Db = sql) {
  requirePerm(user, 'rider.deliver');
  if (!(VEHICLE_TYPES as readonly string[]).includes(args.vehicleType)) throw invalid('Choose a valid vehicle type.');
  const plate = args.vehiclePlate?.trim().slice(0, 20) || null;
  await db`
    insert into rider_profiles (user_id, vehicle_type, vehicle_plate) values (${user!.id}, ${args.vehicleType}, ${plate})
    on conflict (user_id) do update set vehicle_type = excluded.vehicle_type, vehicle_plate = excluded.vehicle_plate`;
}

/** Riders who hold cash (collected minus handed in). For the owner/manager to settle. */
export async function riderCashBalances(user: SessionUser | null, db: Db = sql) {
  requirePerm(user, 'cash.collect');
  const rows = await db<{ riderUserId: string; fullName: string; collected: number; handedIn: number }[]>`
    select u.id as rider_user_id, u.full_name,
           coalesce((select sum(amount_pesewas) from payment_attempts p where p.provider = 'cash' and p.status = 'successful' and p.collected_by = u.id),0)::int as collected,
           coalesce((select sum(amount_pesewas) from rider_cash_handovers h where h.rider_user_id = u.id),0)::int as handed_in
    from users u join user_roles r on r.user_id = u.id and r.role = 'rider' where u.is_active order by u.full_name`;
  return rows.map((r) => ({ riderUserId: r.riderUserId, fullName: r.fullName, balancePesewas: Math.max(0, r.collected - r.handedIn) }));
}

export async function recordCashHandover(user: SessionUser | null, riderUserId: string, amountPesewas: number, note?: string | null, db: Db = sql) {
  requirePerm(user, 'cash.collect');
  if (!Number.isSafeInteger(amountPesewas) || amountPesewas <= 0) throw invalid('Enter an amount greater than zero.');
  await tx(async (t) => {
    await t`select pg_advisory_xact_lock(hashtext(${'cash:' + riderUserId}))`;
    const held = await cashHeld(riderUserId, t);
    const balance = held.collectedPesewas - held.handedInPesewas;
    if (amountPesewas > balance) throw conflict('That is more than the rider is holding.');
    await t`insert into rider_cash_handovers (rider_user_id, amount_pesewas, note, received_by) values (${riderUserId}, ${amountPesewas}, ${note?.trim().slice(0, 200) || null}, ${user!.id})`;
    await audit(t, actorOf(user), 'rider.cash_handed_in', 'user', riderUserId, { amountPesewas });
  }, db);
}
