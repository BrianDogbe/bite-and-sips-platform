import 'server-only';
import { type Db, notifyChange } from '../db';
import { conflict, notFound } from '../errors';
import type { Actor } from '../audit';
import {
  canTransition,
  ORDER_TRANSITIONS,
  KITCHEN_TRANSITIONS,
  PICKUP_TRANSITIONS,
  DELIVERY_TRANSITIONS,
  KITCHEN_STATUS_LABELS,
  FULFILLMENT_STATUS_LABELS,
  type OrderStatus,
  type KitchenStatus,
  type PaymentStatus,
  type FulfillmentStatus,
  type DeliveryStatus,
  type PickupStatus,
} from '@/lib/states';

export interface OrderRow {
  id: string;
  orderNumber: string;
  trackingToken: string;
  customerUserId: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  fulfillmentType: 'pickup' | 'delivery';
  paymentMethod: 'online' | 'cash';
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  kitchenStatus: KitchenStatus;
  needsAttention: boolean;
  attentionReason: string | null;
  subtotalPesewas: number;
  discountPesewas: number;
  deliveryFeePesewas: number;
  serviceChargePesewas: number;
  taxPesewas: number;
  totalPesewas: number;
  refundedPesewas: number;
  currency: string;
  promotionId: number | null;
  customerNotes: string | null;
  scheduledSlotStart: Date;
  promisedAt: Date;
  isAsap: boolean;
  paymentExpiresAt: Date | null;
  placedAt: Date | null;
  acceptedAt: Date | null;
  prepStartedAt: Date | null;
  readyAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  stockDeducted: boolean;
  isTest: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FulfillmentRow {
  orderId: string;
  type: 'pickup' | 'delivery';
  method: 'pickup' | 'in_house' | 'third_party' | 'manual_partner' | null;
  status: FulfillmentStatus;
  addressLine: string | null;
  landmark: string | null;
  instructions: string | null;
  lat: number | null;
  lng: number | null;
  locationVerified: boolean;
  zoneId: number | null;
  zoneName: string | null;
  riderUserId: string | null;
  providerName: string | null;
  externalRef: string | null;
  providerFeePesewas: number | null;
  statusSource: 'system' | 'manual' | 'provider';
  trackingUrl: string | null;
  courierName: string | null;
  courierPhone: string | null;
  pinAttempts: number;
  pinLocked: boolean;
  podMethod: string | null;
  podBy: string | null;
  podNote: string | null;
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
  collectedAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  version: number;
  updatedAt: Date;
}

export async function lockOrder(t: Db, orderId: string): Promise<OrderRow> {
  const rows = await t<OrderRow[]>`select * from orders where id = ${orderId} for update`;
  if (!rows[0]) throw notFound('Order');
  return rows[0];
}

export async function lockFulfillment(t: Db, orderId: string): Promise<FulfillmentRow> {
  const rows = await t<FulfillmentRow[]>`select * from fulfillments where order_id = ${orderId} for update`;
  if (!rows[0]) throw notFound('Fulfillment');
  return rows[0];
}

export interface EventInput {
  domain: 'order' | 'payment' | 'kitchen' | 'fulfillment' | 'note' | 'support';
  type: string;
  from?: string | null;
  to?: string | null;
  message?: string | null;
  customerVisible?: boolean;
  data?: Record<string, unknown>;
}

export async function recordEvent(t: Db, orderId: string, actor: Actor, e: EventInput) {
  await t`
    insert into order_events (order_id, domain, type, from_state, to_state, message, customer_visible, actor_user_id, actor_label, data)
    values (${orderId}, ${e.domain}, ${e.type}, ${e.from ?? null}, ${e.to ?? null}, ${e.message ?? null},
            ${e.customerVisible ?? false}, ${actor.userId}, ${actor.label}, ${t.json((e.data ?? {}) as never)})`;
}

/** Broadcast "something changed" to the relevant live screens (no personal data in the payload). */
export async function signalOrder(t: Db, order: Pick<OrderRow, 'id' | 'fulfillmentType'>, extraTopics: string[] = []) {
  const topics = new Set(['admin', `order:${order.id}`, 'kitchen', ...extraTopics]);
  if (order.fulfillmentType === 'delivery') topics.add('dispatch');
  for (const topic of topics) await notifyChange(t, { topic, id: order.id });
}

export async function setOrderStatus(t: Db, order: OrderRow, to: OrderStatus, actor: Actor, message?: string) {
  if (order.status === to) return order;
  if (!canTransition(ORDER_TRANSITIONS, order.status, to)) {
    throw conflict(`Order cannot move from ${order.status} to ${to}.`, { code: 'invalid_transition' });
  }
  const rows = await t<OrderRow[]>`
    update orders set status = ${to}, version = version + 1, updated_at = now(),
      placed_at = case when ${to} = 'placed' and placed_at is null then now() else placed_at end,
      completed_at = case when ${to} = 'completed' then now() else completed_at end,
      cancelled_at = case when ${to} = 'cancelled' then now() else cancelled_at end
    where id = ${order.id} returning *`;
  await recordEvent(t, order.id, actor, { domain: 'order', type: `order.${to}`, from: order.status, to, message, customerVisible: true });
  return rows[0];
}

export async function setKitchenStatus(t: Db, order: OrderRow, to: KitchenStatus, actor: Actor, message?: string) {
  if (order.kitchenStatus === to) {
    throw conflict(`This order is already marked "${KITCHEN_STATUS_LABELS[to]}".`, { code: 'already_in_state' });
  }
  if (!canTransition(KITCHEN_TRANSITIONS, order.kitchenStatus, to)) {
    throw conflict(`Kitchen status cannot change from "${KITCHEN_STATUS_LABELS[order.kitchenStatus]}" to "${KITCHEN_STATUS_LABELS[to]}".`, {
      code: 'invalid_transition',
    });
  }
  const rows = await t<OrderRow[]>`
    update orders set kitchen_status = ${to}, version = version + 1, updated_at = now(),
      accepted_at = case when ${to} in ('accepted','preparing') and accepted_at is null then now() else accepted_at end,
      prep_started_at = case when ${to} = 'preparing' and prep_started_at is null then now() else prep_started_at end,
      ready_at = case when ${to} = 'ready' then now() when ${to} = 'preparing' then null else ready_at end
    where id = ${order.id} returning *`;
  await recordEvent(t, order.id, actor, {
    domain: 'kitchen',
    type: `kitchen.${to}`,
    from: order.kitchenStatus,
    to,
    message,
    customerVisible: ['accepted', 'preparing', 'ready'].includes(to),
  });
  return rows[0];
}

export async function setFulfillmentStatus(
  t: Db,
  f: FulfillmentRow,
  to: FulfillmentStatus,
  actor: Actor,
  opts: { message?: string; source?: 'system' | 'manual' | 'provider'; data?: Record<string, unknown> } = {},
) {
  if (f.status === to) {
    throw conflict(`Delivery is already "${FULFILLMENT_STATUS_LABELS[to] ?? to}".`, { code: 'already_in_state' });
  }
  const ok =
    f.type === 'pickup'
      ? canTransition(PICKUP_TRANSITIONS, f.status as PickupStatus, to as PickupStatus)
      : canTransition(DELIVERY_TRANSITIONS, f.status as DeliveryStatus, to as DeliveryStatus);
  if (!ok) {
    throw conflict(
      `Cannot change from "${FULFILLMENT_STATUS_LABELS[f.status] ?? f.status}" to "${FULFILLMENT_STATUS_LABELS[to] ?? to}".`,
      { code: 'invalid_transition' },
    );
  }
  const rows = await t<FulfillmentRow[]>`
    update fulfillments set status = ${to}, version = version + 1, updated_at = now(),
      status_source = ${opts.source ?? 'system'},
      picked_up_at = case when ${to} = 'picked_up' then now() else picked_up_at end,
      delivered_at = case when ${to} = 'delivered' then now() else delivered_at end,
      collected_at = case when ${to} = 'collected' then now() else collected_at end,
      failed_at = case when ${to} = 'failed' then now() else failed_at end
    where order_id = ${f.orderId} returning *`;
  await recordEvent(t, f.orderId, actor, {
    domain: 'fulfillment',
    type: `fulfillment.${to}`,
    from: f.status,
    to,
    message: opts.message,
    customerVisible: ['ready_for_pickup', 'collected', 'assigned', 'picked_up', 'on_the_way', 'arrived', 'delivered', 'failed'].includes(to),
    data: { source: opts.source ?? 'system', ...(opts.data ?? {}) },
  });
  return rows[0];
}

export async function setPaymentStatus(t: Db, order: OrderRow, to: PaymentStatus, actor: Actor, message?: string, data?: Record<string, unknown>) {
  if (order.paymentStatus === to) return order;
  const rows = await t<OrderRow[]>`
    update orders set payment_status = ${to}, version = version + 1, updated_at = now() where id = ${order.id} returning *`;
  await recordEvent(t, order.id, actor, {
    domain: 'payment',
    type: `payment.${to}`,
    from: order.paymentStatus,
    to,
    message,
    customerVisible: ['paid', 'failed', 'refund_pending', 'refunded', 'partially_refunded'].includes(to),
    data,
  });
  return rows[0];
}

export async function flagAttention(t: Db, orderId: string, reason: string, actor: Actor) {
  await t`update orders set needs_attention = true, attention_reason = ${reason}, updated_at = now(), version = version + 1 where id = ${orderId}`;
  await recordEvent(t, orderId, actor, { domain: 'order', type: 'order.attention', message: reason });
}

export async function clearAttention(t: Db, orderId: string, actor: Actor, note: string) {
  await t`update orders set needs_attention = false, attention_reason = null, updated_at = now(), version = version + 1 where id = ${orderId}`;
  await recordEvent(t, orderId, actor, { domain: 'order', type: 'order.attention_cleared', message: note });
}
