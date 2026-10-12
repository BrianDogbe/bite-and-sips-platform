import 'server-only';
import { sql, tx, type Db } from '../db';
import { env } from '../env';
import { getSettings } from '../settings';
import { sendSms, sendEmail } from './channels';
import { log } from '../log';

/**
 * Notification outbox. Every notification is created from a server-side event with a
 * deterministic dedupe key, so retried webhooks / double clicks never notify twice.
 * In-app notifications appear on the tracking page immediately; SMS / email rows are
 * queued and dispatched after the transaction commits (and retried by the jobs runner).
 */

export type Template =
  | 'order_received'
  | 'payment_confirmed'
  | 'payment_failed'
  | 'order_confirmed'
  | 'order_preparing'
  | 'order_ready_pickup'
  | 'order_collected'
  | 'rider_assigned'
  | 'out_for_delivery'
  | 'delivered'
  | 'delivery_failed'
  | 'order_cancelled'
  | 'refund_requested'
  | 'refund_processed'
  | 'delay';

interface OrderForNotify {
  id: string;
  orderNumber: string;
  trackingToken: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  customerUserId: string | null;
  fulfillmentType: 'pickup' | 'delivery';
}

/** SMS channel is reserved for high-value events to keep cost and noise down. */
const SMS_TEMPLATES: Template[] = ['payment_confirmed', 'order_ready_pickup', 'out_for_delivery', 'order_cancelled', 'delivery_failed', 'refund_processed'];
const EMAIL_TEMPLATES: Template[] = ['payment_confirmed', 'order_received', 'order_cancelled', 'refund_processed', 'delivered', 'order_collected'];

function render(tpl: Template, o: OrderForNotify, restaurantName: string, extra: Record<string, string>): { title: string; body: string } {
  const n = o.orderNumber;
  const link = `${env().APP_URL}/track/${o.trackingToken}`;
  switch (tpl) {
    case 'order_received':
      return { title: 'Order received', body: `We've received order ${n}. Track it here: ${link}` };
    case 'payment_confirmed':
      return { title: 'Payment confirmed', body: `${restaurantName}: payment for order ${n} is confirmed. Track: ${link}` };
    case 'payment_failed':
      return { title: 'Payment not completed', body: `Payment for order ${n} did not go through. You can try again from your tracking page: ${link}` };
    case 'order_confirmed':
      return { title: 'Order confirmed', body: `The kitchen has accepted order ${n}.` };
    case 'order_preparing':
      return { title: 'Preparing your order', body: `Order ${n} is being prepared.` };
    case 'order_ready_pickup':
      return { title: 'Ready for pickup', body: `${restaurantName}: order ${n} is ready for pickup. Show your order number at the counter.` };
    case 'order_collected':
      return { title: 'Order collected', body: `Order ${n} has been collected. Enjoy your meal!` };
    case 'rider_assigned':
      return { title: 'Rider assigned', body: `A rider has been assigned to order ${n}.` };
    case 'out_for_delivery':
      return { title: 'On the way', body: `${restaurantName}: order ${n} is on the way. Your delivery PIN is on your tracking page: ${link}` };
    case 'delivered':
      return { title: 'Delivered', body: `Order ${n} has been delivered. Enjoy your meal!` };
    case 'delivery_failed':
      return { title: 'Delivery problem', body: `${restaurantName}: we could not complete delivery of order ${n}. We will contact you shortly.` };
    case 'order_cancelled':
      return { title: 'Order cancelled', body: `${restaurantName}: order ${n} was cancelled.${extra.reason ? ` Reason: ${extra.reason}` : ''}` };
    case 'refund_requested':
      return { title: 'Refund started', body: `A refund of ${extra.amount ?? ''} for order ${n} has been requested. It can take a few working days to arrive.` };
    case 'refund_processed':
      return { title: 'Refund processed', body: `${restaurantName}: your refund of ${extra.amount ?? ''} for order ${n} has been processed.` };
    case 'delay':
      return { title: 'Running late', body: `Sorry — order ${n} is taking longer than expected.${extra.note ? ` ${extra.note}` : ''}` };
  }
}

/**
 * Create notifications for an order event. `eventKey` must uniquely identify the triggering
 * event (e.g. the payment reference, or the state transition) so retries are idempotent.
 */
export async function notifyOrder(
  t: Db,
  order: OrderForNotify,
  tpl: Template,
  eventKey: string,
  extra: Record<string, string> = {},
): Promise<void> {
  const restaurant = await getSettings('restaurant', t);
  const ns = await getSettings('notifications', t);
  const { title, body } = render(tpl, order, restaurant.name, extra);
  const base = `${order.id}:${tpl}:${eventKey}`;

  await t`
    insert into notifications (order_id, user_id, channel, template, dedupe_key, recipient, title, body, status, sent_at)
    values (${order.id}, ${order.customerUserId}, 'in_app', ${tpl}, ${base + ':in_app'}, null, ${title}, ${body}, 'sent', now())
    on conflict (dedupe_key) do nothing`;

  if (ns.smsEnabled && SMS_TEMPLATES.includes(tpl) && order.customerPhone) {
    await t`
      insert into notifications (order_id, user_id, channel, template, dedupe_key, recipient, title, body)
      values (${order.id}, ${order.customerUserId}, 'sms', ${tpl}, ${base + ':sms'}, ${order.customerPhone}, ${title}, ${body})
      on conflict (dedupe_key) do nothing`;
  }
  if (ns.emailEnabled && EMAIL_TEMPLATES.includes(tpl) && order.customerEmail) {
    await t`
      insert into notifications (order_id, user_id, channel, template, dedupe_key, recipient, title, body)
      values (${order.id}, ${order.customerUserId}, 'email', ${tpl}, ${base + ':email'}, ${order.customerEmail}, ${title}, ${body})
      on conflict (dedupe_key) do nothing`;
  }
}

/** Send queued SMS/email. Safe to run concurrently (rows are claimed with SKIP LOCKED). */
export async function dispatchQueuedNotifications(limit = 25, db: Db = sql): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const claimed = await tx(async (t) => {
    const rows = await t<{ id: string; channel: 'sms' | 'email'; recipient: string; title: string; body: string; attempts: number }[]>`
      select id, channel, recipient, title, body, attempts from notifications
      where status = 'queued' and attempts < 5
      order by created_at limit ${limit} for update skip locked`;
    if (rows.length) await t`update notifications set attempts = attempts + 1 where id = any(${rows.map((r) => r.id)}::bigint[])`;
    return rows;
  }, db);
  for (const n of claimed) {
    try {
      const res = n.channel === 'sms' ? await sendSms(n.recipient, n.body) : await sendEmail(n.recipient, n.title, n.body);
      if (res.status === 'skipped') {
        await db`update notifications set status = 'skipped', last_error = ${res.detail ?? null} where id = ${n.id}`;
      } else {
        await db`update notifications set status = 'sent', sent_at = now(), provider_ref = ${res.providerRef ?? null} where id = ${n.id}`;
        sent++;
      }
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      await db`update notifications set last_error = ${msg.slice(0, 500)},
        status = case when attempts >= 5 then 'failed' else 'queued' end where id = ${n.id}`;
      log.warn('notification_send_failed', { id: n.id, channel: n.channel, error: msg });
    }
  }
  return { sent, failed };
}

/** Fire-and-forget dispatch after a commit; failures are retried by the jobs runner. */
export function kickNotificationDispatch() {
  dispatchQueuedNotifications().catch((e) => log.warn('notification_dispatch_error', { error: String(e) }));
}

export async function inAppNotificationsForOrder(orderId: string, db: Db = sql) {
  return db<{ id: string; title: string; body: string; createdAt: Date }[]>`
    select id, title, body, created_at from notifications where order_id = ${orderId} and channel = 'in_app' order by id`;
}
