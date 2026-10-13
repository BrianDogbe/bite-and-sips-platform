import 'server-only';
import { sql, type Db } from '../db';
import { forbidden, notFound } from '../errors';
import { requirePerm, requireAnyPerm, hasPerm } from '../auth/guard';
import type { SessionUser } from '../auth/sessions';
import { normalizePhone } from '../auth/sessions';
import { enforceRateLimit } from '../auth/rate-limit';
import { getAllSettings } from '../settings';
import { customerStage, customerTimeline, type FulfillmentStatus } from '@/lib/states';
import { deliveryPin, customerVisibleLocation, listRiders } from '../fulfillment/inhouse';
import { inAppNotificationsForOrder } from '../notifications';
import type { OrderRow, FulfillmentRow } from './core';

export interface OrderItemRow {
  id: string;
  menuItemId: number | null;
  itemName: string;
  variantName: string | null;
  modifiers: { id: number; group: string; name: string; pricePesewas: number }[];
  allergens: string[];
  unitPricePesewas: number;
  quantity: number;
  lineTotalPesewas: number;
  instructions: string | null;
}

export async function itemsFor(orderId: string, db: Db = sql) {
  return db<OrderItemRow[]>`
    select id, menu_item_id, item_name, variant_name, modifiers, allergens, unit_price_pesewas, quantity, line_total_pesewas, instructions
    from order_items where order_id = ${orderId} order by sort_order`;
}

// ---------------------------------------------------------------------------
// Customer tracking (secret token — no login required)
// ---------------------------------------------------------------------------

export async function trackingView(token: string, db: Db = sql) {
  if (!token || token.length < 20 || token.length > 100) throw notFound('Order');
  const [o] = await db<OrderRow[]>`select * from orders where tracking_token = ${token}`;
  if (!o) throw notFound('Order');
  const [f] = await db<FulfillmentRow[]>`select * from fulfillments where order_id = ${o.id}`;
  const items = await itemsFor(o.id, db);
  const settings = await getAllSettings(db);
  const events = await db<{ id: string; type: string; toState: string | null; message: string | null; createdAt: Date }[]>`
    select id, type, to_state, message, created_at from order_events where order_id = ${o.id} and customer_visible order by id`;
  const notifications = await inAppNotificationsForOrder(o.id, db);
  const stage = customerStage({ status: o.status, paymentStatus: o.paymentStatus, kitchenStatus: o.kitchenStatus, fulfillmentType: o.fulfillmentType, fulfillmentStatus: f.status as FulfillmentStatus });
  const timeline = customerTimeline(o.fulfillmentType, o.paymentMethod);

  let rider: { name: string; phone: string | null } | null = null;
  if (f.method === 'in_house' && f.riderUserId && ['accepted', 'at_restaurant', 'picked_up', 'on_the_way', 'arrived'].includes(f.status)) {
    const [r] = await db<{ fullName: string; phone: string | null }[]>`select full_name, phone from users where id = ${f.riderUserId}`;
    if (r) rider = { name: r.fullName.split(' ')[0], phone: ['picked_up', 'on_the_way', 'arrived'].includes(f.status) ? r.phone : null };
  }
  const partner =
    (f.method === 'third_party' || f.method === 'manual_partner') && f.providerName
      ? { name: f.providerName, courierName: f.courierName, courierPhone: f.courierPhone, trackingUrl: f.trackingUrl, manual: f.statusSource === 'manual' || f.method === 'manual_partner' }
      : null;
  const location = o.fulfillmentType === 'delivery' ? await customerVisibleLocation(o.id, db) : null;
  const showPin = o.fulfillmentType === 'delivery' && f.method === 'in_house' && ['assigned', 'accepted', 'at_restaurant', 'picked_up', 'on_the_way', 'arrived'].includes(f.status);
  const canCancel =
    settings.ordering.allowCustomerCancelBeforeKitchen && (o.status === 'pending_payment' || (o.status === 'placed' && ['not_sent', 'new'].includes(o.kitchenStatus)));

  return {
    order: {
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      kitchenStatus: o.kitchenStatus,
      fulfillmentType: o.fulfillmentType,
      customerName: o.customerName,
      subtotalPesewas: o.subtotalPesewas,
      discountPesewas: o.discountPesewas,
      deliveryFeePesewas: o.deliveryFeePesewas,
      serviceChargePesewas: o.serviceChargePesewas,
      taxPesewas: o.taxPesewas,
      totalPesewas: o.totalPesewas,
      refundedPesewas: o.refundedPesewas,
      promisedAt: o.promisedAt,
      isAsap: o.isAsap,
      paymentExpiresAt: o.paymentExpiresAt,
      createdAt: o.createdAt,
      readyAt: o.readyAt,
      completedAt: o.completedAt,
      cancelReason: o.cancelReason,
      isTest: o.isTest,
      notes: o.customerNotes,
    },
    fulfillment: {
      status: f.status,
      method: f.method,
      addressLine: f.addressLine,
      landmark: f.landmark,
      zoneName: f.zoneName,
      deliveredAt: f.deliveredAt,
      collectedAt: f.collectedAt,
      failureReason: f.status === 'failed' ? f.failureReason : null,
    },
    stage,
    timeline,
    items,
    events,
    notifications,
    rider,
    partner,
    location,
    pin: showPin ? deliveryPin(o.id) : null,
    canCancel,
    restaurant: {
      name: settings.restaurant.name,
      phone: settings.restaurant.phone,
      whatsapp: settings.restaurant.whatsapp,
      addressLine: settings.restaurant.addressLine,
      pickupInstructions: settings.restaurant.pickupInstructions,
      timezone: settings.restaurant.timezone,
      lat: settings.restaurant.lat,
      lng: settings.restaurant.lng,
    },
    delivery: { locationStaleSeconds: settings.delivery.locationStaleSeconds },
  };
}

export type TrackingView = Awaited<ReturnType<typeof trackingView>>;

/** Guest lookup: order number + phone → tracking token. Rate limited to stop enumeration. */
export async function lookupGuestOrder(orderNumber: string, phone: string, ip: string | null, db: Db = sql) {
  await enforceRateLimit(`lookup:ip:${ip ?? 'unknown'}`, 10, 15 * 60, db);
  const num = orderNumber.trim().toUpperCase();
  const [o] = await db<{ trackingToken: string }[]>`
    select tracking_token from orders where order_number = ${num} and customer_phone = ${normalizePhone(phone)}`;
  if (!o) throw notFound('Order');
  return o.trackingToken;
}

export async function customerOrders(user: SessionUser, db: Db = sql) {
  return db<{ id: string; orderNumber: string; trackingToken: string; status: string; totalPesewas: number; createdAt: Date; fulfillmentType: string; itemSummary: string }[]>`
    select o.id, o.order_number, o.tracking_token, o.status, o.total_pesewas, o.created_at, o.fulfillment_type,
      (select string_agg(oi.quantity || '× ' || oi.item_name, ', ' order by oi.sort_order) from order_items oi where oi.order_id = o.id) as item_summary
    from orders o where o.customer_user_id = ${user.id} order by o.created_at desc limit 50`;
}

/** Items from a previous order that can be re-added to the cart (customer must own the order). */
export async function reorderLines(user: SessionUser, orderId: string, db: Db = sql) {
  const [o] = await db<{ customerUserId: string | null }[]>`select customer_user_id from orders where id = ${orderId}`;
  if (!o) throw notFound('Order');
  if (o.customerUserId !== user.id) throw forbidden();
  const rows = await db<{ menuItemId: number | null; variantId: number | null; modifiers: { id: number }[]; quantity: number; instructions: string | null }[]>`
    select menu_item_id, variant_id, modifiers, quantity, instructions from order_items where order_id = ${orderId} order by sort_order`;
  return rows
    .filter((r) => r.menuItemId != null)
    .map((r) => ({ menuItemId: r.menuItemId!, variantId: r.variantId, modifierIds: (r.modifiers ?? []).map((m) => m.id), quantity: r.quantity, instructions: r.instructions }));
}

// ---------------------------------------------------------------------------
// Staff views
// ---------------------------------------------------------------------------

export interface OrderListFilters {
  q?: string;
  status?: string;
  paymentStatus?: string;
  fulfillmentType?: string;
  attention?: boolean;
  from?: Date | null;
  to?: Date | null;
  includeTest?: boolean;
  limit?: number;
  offset?: number;
}

export async function listOrders(user: SessionUser | null, f: OrderListFilters, db: Db = sql) {
  requirePerm(user, 'orders.view');
  const showContact = hasPerm(user, 'customers.view');
  const limit = Math.min(f.limit ?? 50, 200);
  const q = f.q?.trim() ? `%${f.q.trim().toUpperCase()}%` : null;
  const rows = await db<
    (Pick<OrderRow, 'id' | 'orderNumber' | 'status' | 'paymentStatus' | 'kitchenStatus' | 'fulfillmentType' | 'paymentMethod' | 'totalPesewas' | 'createdAt' | 'promisedAt' | 'needsAttention' | 'attentionReason' | 'isTest' | 'customerName' | 'customerPhone'> & {
      fulfillmentStatus: string;
      itemCount: number;
    })[]
  >`
    select o.id, o.order_number, o.status, o.payment_status, o.kitchen_status, o.fulfillment_type, o.payment_method, o.total_pesewas,
           o.created_at, o.promised_at, o.needs_attention, o.attention_reason, o.is_test, o.customer_name, o.customer_phone,
           f.status as fulfillment_status,
           (select coalesce(sum(quantity),0)::int from order_items oi where oi.order_id = o.id) as item_count
    from orders o join fulfillments f on f.order_id = o.id
    where (${q}::text is null or upper(o.order_number) like ${q} or upper(o.customer_name) like ${q} or o.customer_phone like ${q})
      and (${f.status ?? null}::text is null or o.status = ${f.status ?? null})
      and (${f.paymentStatus ?? null}::text is null or o.payment_status = ${f.paymentStatus ?? null})
      and (${f.fulfillmentType ?? null}::text is null or o.fulfillment_type = ${f.fulfillmentType ?? null})
      and (${f.attention ?? false} = false or o.needs_attention)
      and (${f.from ?? null}::timestamptz is null or o.created_at >= ${f.from ?? null})
      and (${f.to ?? null}::timestamptz is null or o.created_at < ${f.to ?? null})
      and (${f.includeTest ?? true} or not o.is_test)
    order by o.created_at desc
    limit ${limit} offset ${f.offset ?? 0}`;
  return rows.map((r) => ({ ...r, customerPhone: showContact ? r.customerPhone : maskPhone(r.customerPhone) }));
}

export async function orderDetail(user: SessionUser | null, orderId: string, db: Db = sql) {
  requireAnyPerm(user, ['orders.view', 'dispatch.manage']);
  const [o] = await db<OrderRow[]>`select * from orders where id = ${orderId}`;
  if (!o) throw notFound('Order');
  const [f] = await db<FulfillmentRow[]>`select * from fulfillments where order_id = ${o.id}`;
  const items = await itemsFor(o.id, db);
  const events = await db<{ id: string; domain: string; type: string; fromState: string | null; toState: string | null; message: string | null; actorLabel: string | null; actorName: string | null; createdAt: Date; data: Record<string, unknown> }[]>`
    select e.id, e.domain, e.type, e.from_state, e.to_state, e.message, e.actor_label, u.full_name as actor_name, e.created_at, e.data
    from order_events e left join users u on u.id = e.actor_user_id where e.order_id = ${o.id} order by e.id`;
  const assignments = await db<{ id: string; riderName: string; status: string; assignedAt: Date; respondedAt: Date | null; endedAt: Date | null; endReason: string | null; riderFeePesewas: number | null }[]>`
    select a.id, u.full_name as rider_name, a.status, a.assigned_at, a.responded_at, a.ended_at, a.end_reason, a.rider_fee_pesewas
    from delivery_assignments a join users u on u.id = a.rider_user_id where a.order_id = ${o.id} order by a.assigned_at`;
  const showContact = hasPerm(user, 'customers.view') || hasPerm(user, 'dispatch.manage');
  const canSeePayments = hasPerm(user, 'payments.view');
  const payments = canSeePayments
    ? await db`select id, provider, reference, amount_pesewas, status, channel, fees_pesewas, paid_at, gateway_response, reconciliation_status, created_at
               from payment_attempts where order_id = ${o.id} order by created_at`
    : [];
  const refunds = canSeePayments ? await db`select * from refunds where order_id = ${o.id} order by created_at` : [];
  const bookings = await db`select * from provider_bookings where order_id = ${o.id} order by created_at desc`;
  return {
    order: { ...o, customerPhone: showContact ? o.customerPhone : maskPhone(o.customerPhone), customerEmail: showContact ? o.customerEmail : null, trackingToken: undefined },
    fulfillment: showContact ? f : { ...f, addressLine: f.addressLine ? '(hidden)' : null, lat: null, lng: null },
    items,
    events,
    assignments,
    payments,
    refunds,
    bookings,
  };
}

export function maskPhone(p: string) {
  return p && p.length > 6 ? `${p.slice(0, 4)}•••${p.slice(-3)}` : '•••';
}

/** Kitchen queue: everything the kitchen should see — no financial or contact data. */
export async function kitchenQueue(user: SessionUser | null, db: Db = sql) {
  requireAnyPerm(user, ['kitchen.operate', 'kitchen.monitor']);
  const orders = await db<
    {
      id: string;
      orderNumber: string;
      kitchenStatus: string;
      fulfillmentType: string;
      fulfillmentStatus: string;
      customerFirstName: string;
      promisedAt: Date;
      isAsap: boolean;
      placedAt: Date | null;
      acceptedAt: Date | null;
      prepStartedAt: Date | null;
      readyAt: Date | null;
      customerNotes: string | null;
      version: number;
      riderAssigned: boolean;
      riderName: string | null;
      paymentStatus: string;
    }[]
  >`
    select o.id, o.order_number, o.kitchen_status, o.fulfillment_type, f.status as fulfillment_status,
           split_part(o.customer_name, ' ', 1) as customer_first_name, o.promised_at, o.is_asap, o.placed_at, o.accepted_at,
           o.prep_started_at, o.ready_at, o.customer_notes, o.version, (f.rider_user_id is not null or f.provider_name is not null) as rider_assigned,
           ru.full_name as rider_name, o.payment_status
    from orders o join fulfillments f on f.order_id = o.id left join users ru on ru.id = f.rider_user_id
    where o.kitchen_status in ('new','accepted','preparing','ready')
       or (o.kitchen_status = 'handed_off' and o.updated_at > now() - interval '30 minutes')
    order by o.promised_at, o.placed_at`;
  const ids = orders.map((o) => o.id);
  const items = ids.length
    ? await db<(OrderItemRow & { orderId: string })[]>`
        select order_id, id, menu_item_id, item_name, variant_name, modifiers, allergens, unit_price_pesewas, quantity, line_total_pesewas, instructions
        from order_items where order_id = any(${ids}::uuid[]) order by sort_order`
    : [];
  const byOrder = new Map<string, Omit<OrderItemRow, 'unitPricePesewas' | 'lineTotalPesewas'>[]>();
  for (const it of items) {
    const { orderId, unitPricePesewas: _u, lineTotalPesewas: _l, ...rest } = it;
    void _u;
    void _l;
    (byOrder.get(orderId) ?? byOrder.set(orderId, []).get(orderId)!).push(rest);
  }
  const unavailable = await db<{ id: number; name: string; unavailableReason: string | null }[]>`
    select id, name, unavailable_reason from menu_items where not is_available and not is_archived order by name`;
  const alerts = await db<{ id: string; orderNumber: string | null; kind: string; message: string; raisedAt: Date; raisedByName: string | null }[]>`
    select e.id, o.order_number, e.kind, e.message, e.raised_at, u.full_name as raised_by_name
    from operational_exceptions e left join orders o on o.id = e.order_id left join users u on u.id = e.raised_by
    where e.resolved_at is null and (e.order_id is null or o.needs_attention) and e.kind in ('kitchen_issue','kitchen_delay') order by e.raised_at desc limit 20`;
  // Riders the kitchen can choose from (names and availability only; no phone numbers or locations).
  const canAssign = hasPerm(user, 'dispatch.assign') || hasPerm(user, 'dispatch.manage');
  const riders = canAssign
    ? (await listRiders(db)).map((r) => ({ id: r.userId, name: r.fullName, online: r.online, active: r.activeDeliveries }))
    : [];
  return { serverTime: new Date().toISOString(), orders: orders.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] })), unavailable, alerts, riders, canAssign };
}

export type KitchenQueue = Awaited<ReturnType<typeof kitchenQueue>>;

export async function dispatchBoard(user: SessionUser | null, db: Db = sql) {
  requirePerm(user, 'dispatch.manage');
  const rows = await db<
    {
      id: string;
      orderNumber: string;
      status: string;
      kitchenStatus: string;
      paymentStatus: string;
      paymentMethod: string;
      totalPesewas: number;
      promisedAt: Date;
      customerName: string;
      customerPhone: string;
      fulfillmentStatus: string;
      method: string | null;
      addressLine: string | null;
      landmark: string | null;
      lat: number | null;
      lng: number | null;
      locationVerified: boolean;
      zoneName: string | null;
      riderUserId: string | null;
      riderName: string | null;
      providerName: string | null;
      externalRef: string | null;
      providerFeePesewas: number | null;
      statusSource: string;
      courierName: string | null;
      courierPhone: string | null;
      pinLocked: boolean;
      needsAttention: boolean;
      attentionReason: string | null;
      riderLastLat: number | null;
      riderLastLng: number | null;
      riderLastLocationAt: Date | null;
      bookingId: string | null;
      bookingStatus: string | null;
      bookingManual: boolean | null;
      updatedAt: Date;
    }[]
  >`
    select o.id, o.order_number, o.status, o.kitchen_status, o.payment_status, o.payment_method, o.total_pesewas, o.promised_at,
           o.customer_name, o.customer_phone, f.status as fulfillment_status, f.method, f.address_line, f.landmark, f.lat, f.lng,
           f.location_verified, f.zone_name, f.rider_user_id, u.full_name as rider_name, f.provider_name, f.external_ref,
           f.provider_fee_pesewas, f.status_source, f.courier_name, f.courier_phone, f.pin_locked, o.needs_attention, o.attention_reason,
           rp.last_lat as rider_last_lat, rp.last_lng as rider_last_lng, rp.last_location_at as rider_last_location_at,
           pb.id as booking_id, pb.status as booking_status, pb.is_manual as booking_manual, f.updated_at
    from orders o
    join fulfillments f on f.order_id = o.id and f.type = 'delivery'
    left join users u on u.id = f.rider_user_id
    left join rider_profiles rp on rp.user_id = f.rider_user_id
    left join lateral (select id, status, is_manual from provider_bookings b where b.order_id = o.id order by b.created_at desc limit 1) pb on true
    where o.status in ('placed','in_progress') or (o.status = 'completed' and o.completed_at > now() - interval '3 hours')
       or f.status in ('failed','returned')
    order by o.promised_at`;
  return rows;
}

export type DispatchRow = Awaited<ReturnType<typeof dispatchBoard>>[number];
