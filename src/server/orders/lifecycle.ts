import 'server-only';
import { sql, tx, type Db } from '../db';
import { conflict, forbidden, invalid } from '../errors';
import { audit, type Actor } from '../audit';
import { getSettings } from '../settings';
import { releaseSlot } from '../scheduling';
import { notifyOrder, kickNotificationDispatch } from '../notifications';
import { deductForOrder } from '../inventory';
import {
  lockOrder,
  lockFulfillment,
  setOrderStatus,
  setKitchenStatus,
  setFulfillmentStatus,
  setPaymentStatus,
  signalOrder,
  flagAttention,
  recordEvent,
  type OrderRow,
} from './core';
import { log } from '../log';
import { requirePerm, requireAnyPerm, actorOf } from '../auth/guard';
import type { SessionUser } from '../auth/sessions';

/**
 * Move a newly-confirmed order into operations: called when an online payment is VERIFIED,
 * or immediately at checkout for an authorised cash-on-collection/delivery order.
 */
export async function placeOrder(t: Db, orderIn: OrderRow, actor: Actor, eventKey: string): Promise<OrderRow> {
  let order = orderIn;
  if (order.status !== 'pending_payment') return order; // idempotent
  const ordering = await getSettings('ordering', t);
  order = await setOrderStatus(t, order, 'placed', actor);
  order = await setKitchenStatus(t, order, ordering.autoAcceptOrders ? 'accepted' : 'new', actor, ordering.autoAcceptOrders ? 'Auto-accepted' : undefined);
  if (order.fulfillmentType === 'delivery') {
    const f = await lockFulfillment(t, order.id);
    if (f.status === 'pending') await setFulfillmentStatus(t, f, 'unassigned', actor, { message: 'Ready for dispatch planning' });
  }
  await notifyOrder(t, order, order.paymentMethod === 'online' ? 'payment_confirmed' : 'order_received', eventKey);
  if (ordering.autoAcceptOrders) await notifyOrder(t, order, 'order_confirmed', eventKey);
  await signalOrder(t, order);
  return order;
}

type KitchenAction = 'accept' | 'start' | 'ready' | 'recall';

/** Kitchen ticket actions. Row lock + transition table prevent conflicting updates from several tablets. */
export async function kitchenAction(user: SessionUser | null, orderId: string, action: KitchenAction, opts: { note?: string } = {}, db: Db = sql) {
  requirePerm(user, 'kitchen.operate');
  const actor = actorOf(user);
  const res = await tx(async (t) => {
    let order = await lockOrder(t, orderId);
    if (order.status === 'cancelled') throw conflict('This order was cancelled.', { code: 'cancelled' });
    if (order.status === 'pending_payment') throw conflict('This order is not paid yet.', { code: 'not_placed' });
    const target = { accept: 'accepted', start: 'preparing', ready: 'ready', recall: 'preparing' } as const;
    if (action === 'recall' && order.kitchenStatus !== 'ready') throw conflict('Only ready orders can be recalled.');
    order = await setKitchenStatus(t, order, target[action], actor, opts.note);

    if (action === 'accept') await notifyOrder(t, order, 'order_confirmed', 'kitchen');
    if (action === 'start') {
      if (order.status === 'placed') order = await setOrderStatus(t, order, 'in_progress', actor);
      await notifyOrder(t, order, 'order_preparing', 'kitchen');
      const inv = await getSettings('inventory', t);
      if (inv.autoDeductOnPrep) {
        const r = await deductForOrder(t, order.id, actor);
        if (r.shortfalls.length) {
          await recordEvent(t, order.id, actor, { domain: 'kitchen', type: 'inventory.shortfall', message: `Recorded stock short: ${r.shortfalls.join(', ')}` });
        }
      }
    }
    if (action === 'ready') {
      if (order.status === 'placed') order = await setOrderStatus(t, order, 'in_progress', actor);
      if (order.fulfillmentType === 'pickup') {
        const f = await lockFulfillment(t, order.id);
        if (f.status === 'pending') await setFulfillmentStatus(t, f, 'ready_for_pickup', actor);
        await notifyOrder(t, order, 'order_ready_pickup', `ready:${order.version}`);
      }
    }
    if (action === 'recall' && order.fulfillmentType === 'pickup') {
      const f = await lockFulfillment(t, order.id);
      if (f.status === 'ready_for_pickup') await setFulfillmentStatus(t, f, 'pending', actor, { message: 'Recalled by kitchen' });
    }
    await signalOrder(t, order);
    return order;
  }, db);
  kickNotificationDispatch();
  return res;
}

/** Customer collected a pickup order at the counter. Cash orders must have cash recorded first. */
export async function markPickupCollected(user: SessionUser | null, orderId: string, opts: { note?: string } = {}, db: Db = sql) {
  requireAnyPerm(user, ['orders.manage', 'kitchen.operate']);
  const actor = actorOf(user);
  const res = await tx(async (t) => {
    let order = await lockOrder(t, orderId);
    if (order.fulfillmentType !== 'pickup') throw invalid('Not a pickup order.');
    if (order.status === 'cancelled' || order.status === 'completed') throw conflict(`Order is already ${order.status}.`);
    if (order.kitchenStatus !== 'ready') throw conflict('The kitchen has not marked this order ready.', { code: 'not_ready' });
    if (order.paymentStatus === 'cash_due') throw conflict('Record the cash payment before handing over the order.', { code: 'cash_due' });
    if (!['paid', 'cash_collected', 'partially_refunded'].includes(order.paymentStatus)) {
      throw conflict('This order is not paid.', { code: 'not_paid' });
    }
    const f = await lockFulfillment(t, order.id);
    await setFulfillmentStatus(t, f, 'collected', actor, { message: opts.note });
    await t`update fulfillments set pod_method = 'staff_handoff', pod_by = ${actor.userId}, pod_note = ${opts.note ?? null} where order_id = ${order.id}`;
    order = await setKitchenStatus(t, order, 'handed_off', actor);
    order = await setOrderStatus(t, order, 'completed', actor);
    await t`update slot_reservations set released_at = coalesce(released_at, now()) where order_id = ${order.id}`;
    await notifyOrder(t, order, 'order_collected', 'collected');
    await signalOrder(t, order);
    return order;
  }, db);
  kickNotificationDispatch();
  return res;
}

export interface CancelOptions {
  reason: string;
  by: 'customer' | 'staff' | 'system';
  /** staff only — whether to start a full refund straight away (handled by the payments module) */
  refund?: boolean;
}

/**
 * Cancel an order. Customers may cancel only before the kitchen starts (if policy allows).
 * Staff with orders.cancel may cancel any non-completed order with a reason.
 * Releases the kitchen slot and voids promotion use. Paid orders are flagged for a refund decision
 * (or refunded immediately by the caller). Consumed ingredients are NOT restored automatically.
 */
export async function cancelOrder(orderId: string, actor: Actor, opts: CancelOptions, db: Db = sql) {
  if (!opts.reason?.trim()) throw invalid('A cancellation reason is required.');
  if (opts.reason.length > 500) throw invalid('Reason is too long.');
  const res = await tx(async (t) => {
    let order = await lockOrder(t, orderId);
    if (order.status === 'cancelled') return { order, alreadyCancelled: true, needsRefund: false };
    if (order.status === 'completed') throw conflict('Completed orders cannot be cancelled. Use a refund instead.');

    if (opts.by === 'customer') {
      const ordering = await getSettings('ordering', t);
      const early = order.status === 'pending_payment' || ['not_sent', 'new'].includes(order.kitchenStatus);
      if (!early || (!ordering.allowCustomerCancelBeforeKitchen && order.status !== 'pending_payment')) {
        throw forbidden('This order can no longer be cancelled online. Please contact us.');
      }
    }

    const f = await lockFulfillment(t, order.id);
    if (f.type === 'delivery' && ['picked_up', 'on_the_way', 'arrived', 'delivered'].includes(f.status)) {
      throw conflict('The order is already out for delivery. Mark the delivery failed/returned first.');
    }
    // Live third-party booking must be cancelled with the provider first (handled by fulfillment module).
    const liveBooking = await t`select id from provider_bookings where order_id = ${order.id}
      and status in ('requesting','unknown','requested','accepted','courier_assigned') limit 1`;
    if (liveBooking.length) throw conflict('Cancel the delivery partner booking first (Dispatch → Cancel booking).', { code: 'live_booking' });

    if (f.status !== 'cancelled') await setFulfillmentStatus(t, f, 'cancelled', actor, { message: opts.reason });
    if (!['handed_off', 'cancelled'].includes(order.kitchenStatus)) order = await setKitchenStatus(t, order, 'cancelled', actor, opts.reason);
    order = await setOrderStatus(t, order, 'cancelled', actor, opts.reason);
    await t`update orders set cancel_reason = ${opts.reason}, cancelled_by = ${actor.userId} where id = ${order.id}`;
    await t`update delivery_assignments set status = 'cancelled', ended_at = now(), end_reason = 'order cancelled'
            where order_id = ${order.id} and status in ('offered','accepted')`;
    await releaseSlot(t, order.id);
    const redemption = await t<{ promotionId: number }[]>`
      update promotion_redemptions set voided_at = now() where order_id = ${order.id} and voided_at is null returning promotion_id`;
    if (redemption[0]) await t`update promotions set used_count = greatest(used_count - 1, 0) where id = ${redemption[0].promotionId}`;

    // Unpaid online orders: mark the payment as no longer expected.
    if (order.paymentStatus === 'unpaid' || order.paymentStatus === 'pending' || order.paymentStatus === 'failed') {
      await t`update payment_attempts set status = 'abandoned', updated_at = now() where order_id = ${order.id} and status in ('initialized','pending')`;
    }
    const needsRefund = ['paid', 'cash_collected', 'partially_refunded'].includes(order.paymentStatus);
    if (needsRefund && !opts.refund) {
      await flagAttention(t, order.id, 'Cancelled after payment — decide on refund', actor);
    }
    if (order.stockDeducted) {
      await recordEvent(t, order.id, actor, {
        domain: 'order',
        type: 'inventory.not_restored',
        message: 'Ingredients were deducted when preparation started and were not restored automatically. Record a sale reversal if unused.',
      });
    }
    await audit(t, actor, 'order.cancelled', 'order', order.id, { reason: opts.reason, by: opts.by, paymentStatus: order.paymentStatus });
    await notifyOrder(t, order, 'order_cancelled', 'cancel', { reason: opts.reason });
    await signalOrder(t, order, order.fulfillmentType === 'delivery' && f.riderUserId ? [`rider:${f.riderUserId}`] : []);
    return { order, alreadyCancelled: false, needsRefund };
  }, db);
  kickNotificationDispatch();
  return res;
}

/**
 * Kitchen declines an order it has not accepted yet (for example, out of an ingredient).
 * Cancels the order with the stated reason; the customer is notified and a paid order is flagged
 * for a refund decision. Only allowed before the kitchen accepts.
 */
export async function kitchenDecline(user: SessionUser | null, orderId: string, reason: string, db: Db = sql) {
  requirePerm(user, 'kitchen.operate');
  const [o] = await db<{ kitchenStatus: string; status: string }[]>`select kitchen_status, status from orders where id = ${orderId}`;
  if (!o) throw invalid('Order not found.');
  if (o.kitchenStatus !== 'new') throw conflict('Only new orders can be declined. Report a problem to a manager instead.');
  return cancelOrder(orderId, actorOf(user), { reason: `Declined by the kitchen: ${reason.trim()}`, by: 'staff' }, db);
}

/** Staff cancellation (requires orders.cancel). */
export async function staffCancelOrder(user: SessionUser | null, orderId: string, reason: string, db: Db = sql) {
  requirePerm(user, 'orders.cancel');
  return cancelOrder(orderId, actorOf(user), { reason, by: 'staff' }, db);
}

/**
 * Record cash received for a cash-on-pickup / cash-on-delivery order.
 * Allowed for staff with cash.collect, or the rider currently assigned to that delivery.
 */
export async function recordCashCollected(user: SessionUser | null, orderId: string, amountPesewas: number, db: Db = sql) {
  const actor = actorOf(user);
  return tx(async (t) => {
    let order = await lockOrder(t, orderId);
    if (!user?.permissions.has('cash.collect')) {
      requirePerm(user, 'rider.deliver');
      const [f] = await t<{ riderUserId: string | null }[]>`select rider_user_id from fulfillments where order_id = ${orderId}`;
      if (!f || f.riderUserId !== user!.id) throw forbidden();
    }
    if (order.paymentMethod !== 'cash') throw invalid('This is not a cash order.');
    if (order.paymentStatus === 'cash_collected') return order;
    if (order.paymentStatus !== 'cash_due') throw conflict(`Payment status is ${order.paymentStatus}.`);
    if (amountPesewas !== order.totalPesewas) {
      throw invalid(`Cash collected must equal the order total. Record differences in a note and contact a manager.`);
    }
    const ref = `${order.orderNumber}-CASH`;
    await t`
      insert into payment_attempts (order_id, provider, reference, amount_pesewas, currency, status, channel, paid_at, collected_by, reconciliation_status)
      values (${order.id}, 'cash', ${ref}, ${amountPesewas}, 'GHS', 'successful', 'cash', now(), ${actor.userId}, 'unreconciled')
      on conflict (reference) do nothing`;
    order = await setPaymentStatus(t, order, 'cash_collected', actor, 'Cash received');
    await audit(t, actor, 'payment.cash_collected', 'order', order.id, { amountPesewas });
    await signalOrder(t, order);
    return order;
  }, db);
}

export async function addInternalNote(user: SessionUser | null, orderId: string, note: string, db: Db = sql) {
  requireAnyPerm(user, ['orders.manage', 'dispatch.manage']);
  const actor = actorOf(user);
  if (!note.trim() || note.length > 1000) throw invalid('Note must be 1–1000 characters.');
  await tx(async (t) => {
    const order = await lockOrder(t, orderId);
    await recordEvent(t, order.id, actor, { domain: 'note', type: 'note.internal', message: note.trim() });
    await signalOrder(t, order);
  }, db);
}

export function safeLogError(context: string, e: unknown) {
  log.error(context, { error: e instanceof Error ? e.message : String(e) });
}

/**
 * Customer self-cancellation from the tracking page (secret token). Allowed only before the kitchen
 * starts and when policy permits. Paid orders get an automatic full refund request.
 */
export async function customerCancelByToken(token: string, reason: string, ip: string | null, db: Db = sql) {
  const { enforceRateLimit } = await import('../auth/rate-limit');
  await enforceRateLimit(`cancel:ip:${ip ?? 'unknown'}`, 10, 15 * 60, db);
  const [o] = await db<{ id: string; totalPesewas: number }[]>`select id, total_pesewas from orders where tracking_token = ${token}`;
  if (!o) throw invalid('Order not found.');
  const actor: Actor = { userId: null, label: 'customer', ip };
  const res = await cancelOrder(o.id, actor, { reason: reason?.trim() || 'Cancelled by customer', by: 'customer', refund: true }, db);
  if (res.needsRefund && !res.alreadyCancelled) {
    const { createRefundInternal, refundableAmount } = await import('../payments/service');
    const { refundable } = await refundableAmount(db, o.id);
    if (refundable > 0) {
      try {
        await createRefundInternal(actor, { orderId: o.id, amountPesewas: refundable, reason: 'Customer cancelled before preparation', idempotencyKey: `cust-cancel-${o.id}` }, db);
      } catch (e) {
        safeLogError('customer_cancel_refund_failed', e);
        await tx((t) => flagAttention(t, o.id, 'Automatic refund after customer cancellation failed — refund manually', actor), db);
      }
    }
  }
  return res;
}
