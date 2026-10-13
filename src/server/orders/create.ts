import 'server-only';
import { randomUUID } from 'node:crypto';
import { sql, tx, type Db } from '../db';
import { conflict, invalid, DomainError } from '../errors';
import { createOrderSchema, type CreateOrderInput } from '@/lib/validation';
import { getAllSettings } from '../settings';
import { loadMenu } from '../menu';
import { listZones, resolveZone, ZONE_ERRORS } from '../zones';
import { quote } from '../pricing';
import { claimSlot, insertReservation } from '../scheduling';
import { newOrderNumber, newToken } from '../ids';
import { normalizePhone } from '../auth/sessions';
import { enforceRateLimit } from '../auth/rate-limit';
import { recordEvent, signalOrder, type OrderRow } from './core';
import { placeOrder } from './lifecycle';
import { notifyOrder, kickNotificationDispatch } from '../notifications';
import { activePaymentProvider } from '../payments/provider';
import type { SessionUser } from '../auth/sessions';
import { addMinutes } from '@/lib/time';

export interface CreateOrderResult {
  orderId: string;
  orderNumber: string;
  trackingToken: string;
  status: OrderRow['status'];
  paymentMethod: 'online' | 'cash';
  totalPesewas: number;
  duplicate: boolean;
}

/**
 * Create an order through a single controlled server-side process:
 * validate input → re-price from the database → validate fulfillment → claim a kitchen slot →
 * persist immutable item snapshots → (cash) send to kitchen / (online) await verified payment.
 *
 * Idempotent on `idempotencyKey`: a repeated submission returns the original order.
 */
export async function createOrder(
  rawInput: unknown,
  ctx: { user: SessionUser | null; ip?: string | null; now?: Date },
  db: Db = sql,
): Promise<CreateOrderResult> {
  const parsed = createOrderSchema.safeParse(rawInput);
  if (!parsed.success) throw invalid('Please check your order details.', parsed.error.flatten());
  const input: CreateOrderInput = parsed.data;
  const phone = normalizePhone(input.contact.phone);
  const email = input.contact.email ? input.contact.email.trim().toLowerCase() : null;

  // Repeat submission? Return the existing order (no second order, no second slot).
  const existing = await findByIdempotencyKey(input.idempotencyKey, db);
  if (existing) {
    if (existing.customerPhone !== phone) throw conflict('This checkout session was already used. Please refresh and try again.');
    return toResult(existing, true);
  }

  await enforceRateLimit(`checkout:ip:${ctx.ip ?? 'unknown'}`, 20, 10 * 60, db);
  await enforceRateLimit(`checkout:phone:${phone}`, 8, 10 * 60, db);

  const now = ctx.now ?? new Date();
  const settings = await getAllSettings(db);
  const { ordering, delivery, restaurant } = settings;
  const tz = restaurant.timezone;

  if (!ordering.acceptingOrders) throw new DomainError('ordering_paused', ordering.pauseMessage, 409);
  if (input.fulfillment.type === 'pickup' && !ordering.pickupEnabled) throw conflict('Pickup is not available right now.');
  if (input.fulfillment.type === 'delivery' && !ordering.deliveryEnabled) throw conflict('Delivery is not available right now.');

  // Payment method policy
  if (input.paymentMethod === 'online') {
    if (!ordering.onlinePaymentsEnabled || !activePaymentProvider()) throw conflict('Online payment is not available right now.');
    if (!email) throw invalid('An email address is required for online payment receipts.', { fieldErrors: { email: ['Required for online payment'] } });
  } else {
    const allowed = input.fulfillment.type === 'pickup' ? ordering.cashOnPickupEnabled : ordering.cashOnDeliveryEnabled;
    if (!allowed) throw conflict(`Cash payment is not available for ${input.fulfillment.type}.`);
  }

  const menu = await loadMenu({ includeArchived: true, includeInactiveCategories: true }, db);
  const zones = input.fulfillment.type === 'delivery' ? await listZones({ activeOnly: true }, db) : [];

  // Validate delivery location up-front for a clear error.
  let zoneRes: ReturnType<typeof resolveZone> | null = null;
  if (input.fulfillment.type === 'delivery') {
    zoneRes = resolveZone(zones, input.fulfillment, delivery.allowManualZoneSelection, { lat: restaurant.lat, lng: restaurant.lng });
    if (!zoneRes.ok) throw conflict(ZONE_ERRORS[zoneRes.reason], { code: zoneRes.reason });
  }

  const fulfillmentForQuote =
    input.fulfillment.type === 'delivery'
      ? { type: 'delivery' as const, lat: input.fulfillment.lat, lng: input.fulfillment.lng, zoneId: input.fulfillment.zoneId }
      : { type: 'pickup' as const };

  const prelim = await quote({ items: input.items, fulfillment: fulfillmentForQuote, promoCode: input.promoCode }, { menu, ordering, delivery, zones, restaurant: { lat: restaurant.lat, lng: restaurant.lng }, tz, at: now }, db);
  const scheduleProblems = prelim.problems.filter((p) => p.code !== 'schedule');
  if (scheduleProblems.length) throw conflict('Some items in your cart need attention.', { problems: scheduleProblems });
  if (prelim.promoError) throw conflict(prelim.promoError, { code: 'promo' });
  if (prelim.fulfillmentError) throw conflict(prelim.fulfillmentError);
  if (prelim.minOrderError) throw conflict(prelim.minOrderError, { code: 'min_order' });

  const orderId = randomUUID();
  try {
    const order = await tx(async (t) => {
      const slot = await claimSlot(t, {
        requested: input.fulfillment.slot ?? null,
        now,
        tz,
        kind: input.fulfillment.type,
        prepMinutes: prelim.maxPrepMinutes,
        settings: ordering,
      });

      // Re-price at the booked time (item time windows) — this is the authoritative quote.
      const q = await quote(
        { items: input.items, fulfillment: fulfillmentForQuote, promoCode: input.promoCode },
        { menu, ordering, delivery, zones, restaurant: { lat: restaurant.lat, lng: restaurant.lng }, tz, at: slot.slotStart },
        t,
      );
      if (q.problems.length) throw conflict('Some items are not available at the selected time.', { problems: q.problems });
      if (q.promoError) throw conflict(q.promoError, { code: 'promo' });
      if (q.fulfillmentError) throw conflict(q.fulfillmentError);
      if (q.minOrderError) throw conflict(q.minOrderError, { code: 'min_order' });

      // Promotion usage is claimed atomically so usage limits cannot be exceeded.
      if (q.promo) {
        const claimed = await t`
          update promotions set used_count = used_count + 1
          where id = ${q.promo.id} and is_active and (usage_limit is null or used_count < usage_limit) returning id`;
        if (!claimed.length) throw conflict('That promo code has just been fully redeemed.', { code: 'promo' });
      }

      const isCash = input.paymentMethod === 'cash';
      const provider = activePaymentProvider();
      const isTest = !isCash && provider === 'mock';
      const trackingToken = newToken(32);
      const orderNumber = await uniqueOrderNumber(t);

      const [row] = await t<OrderRow[]>`
        insert into orders (
          id, order_number, tracking_token, idempotency_key, customer_user_id, customer_name, customer_phone, customer_email,
          fulfillment_type, payment_method, status, payment_status, kitchen_status,
          subtotal_pesewas, discount_pesewas, delivery_fee_pesewas, service_charge_pesewas, tax_pesewas, total_pesewas,
          promotion_id, customer_notes, scheduled_slot_start, promised_at, is_asap, payment_expires_at, is_test
        ) values (
          ${orderId}, ${orderNumber}, ${trackingToken}, ${input.idempotencyKey}, ${ctx.user?.id ?? null}, ${input.contact.name.trim()}, ${phone}, ${email},
          ${input.fulfillment.type}, ${input.paymentMethod}, 'pending_payment', ${isCash ? 'cash_due' : 'unpaid'}, 'not_sent',
          ${q.subtotalPesewas}, ${q.discountPesewas}, ${q.deliveryFeePesewas}, ${q.serviceChargePesewas}, ${q.taxPesewas}, ${q.totalPesewas},
          ${q.promo?.id ?? null}, ${input.notes?.trim() || null}, ${slot.slotStart}, ${slot.slotStart}, ${slot.isAsap},
          ${isCash ? null : addMinutes(now, ordering.paymentWindowMinutes)}, ${isTest}
        ) returning *`;

      await insertReservation(t, orderId, slot.slotStart);

      let sort = 0;
      for (const l of q.lines) {
        await t`
          insert into order_items (order_id, menu_item_id, variant_id, item_name, variant_name, modifiers, allergens,
            base_price_pesewas, unit_price_pesewas, quantity, line_total_pesewas, instructions, sort_order)
          values (${orderId}, ${l.menuItemId}, ${l.variantId}, ${l.itemName}, ${l.variantName}, ${t.json(l.modifiers as never)}, ${l.allergens},
            ${l.basePricePesewas}, ${l.unitPricePesewas}, ${l.quantity}, ${l.lineTotalPesewas}, ${l.instructions}, ${sort++})`;
      }

      if (q.promo) {
        await t`insert into promotion_redemptions (promotion_id, order_id, amount_pesewas) values (${q.promo.id}, ${orderId}, ${q.discountPesewas})`;
      }

      if (input.fulfillment.type === 'pickup') {
        await t`insert into fulfillments (order_id, type, method, status) values (${orderId}, 'pickup', 'pickup', 'pending')`;
      } else {
        const zr = zoneRes as Extract<NonNullable<typeof zoneRes>, { ok: true }>;
        const f = input.fulfillment;
        await t`
          insert into fulfillments (order_id, type, method, status, address_line, landmark, instructions, lat, lng, location_verified, zone_id, zone_name)
          values (${orderId}, 'delivery', null, 'pending', ${f.addressLine}, ${f.landmark ?? null}, ${f.instructions ?? null},
                  ${f.lat ?? null}, ${f.lng ?? null}, ${zr.verified}, ${zr.zone.id}, ${zr.zone.name})`;
      }

      const actor = { userId: ctx.user?.id ?? null, label: 'customer', ip: ctx.ip };
      await recordEvent(t, orderId, actor, {
        domain: 'order',
        type: 'order.created',
        to: 'pending_payment',
        message: isCash ? 'Order placed (cash payment)' : 'Order created — awaiting payment',
        customerVisible: true,
        data: { totalPesewas: q.totalPesewas, slot: slot.slotStart.toISOString(), asap: slot.isAsap },
      });

      let finalRow = row;
      if (isCash) finalRow = await placeOrder(t, row, actor, 'created');
      else {
        await notifyOrder(t, row, 'order_received', 'created');
        await signalOrder(t, row);
      }
      return finalRow;
    }, db);
    kickNotificationDispatch();
    return toResult(order, false);
  } catch (e) {
    // Two identical submissions racing: the loser hits the unique idempotency key.
    if (isUniqueViolation(e, 'orders_idempotency_key_key')) {
      const again = await findByIdempotencyKey(input.idempotencyKey, db);
      if (again) return toResult(again, true);
    }
    throw e;
  }
}

async function uniqueOrderNumber(t: Db): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const n = newOrderNumber();
    const r = await t`select 1 from orders where order_number = ${n}`;
    if (!r.length) return n;
  }
  throw new Error('Could not allocate an order number');
}

async function findByIdempotencyKey(key: string, db: Db) {
  const rows = await db<OrderRow[]>`select * from orders where idempotency_key = ${key}`;
  return rows[0] ?? null;
}

function toResult(o: OrderRow, duplicate: boolean): CreateOrderResult {
  return {
    orderId: o.id,
    orderNumber: o.orderNumber,
    trackingToken: o.trackingToken,
    status: o.status,
    paymentMethod: o.paymentMethod,
    totalPesewas: o.totalPesewas,
    duplicate,
  };
}

export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  const err = e as { code?: string; constraint_name?: string; constraint?: string };
  if (err?.code !== '23505') return false;
  return !constraint || err.constraint_name === constraint || err.constraint === constraint;
}
