import 'server-only';
import { sql, type Db } from './db';
import { requirePerm, requireAnyPerm } from './auth/guard';
import type { SessionUser } from './auth/sessions';
import { getSettings } from './settings';
import { zonedToUtc, localParts } from '@/lib/time';
import { lowStock } from './inventory';
import { invalid, notFound } from './errors';
import { audit } from './audit';
import { actorOf } from './auth/guard';

/**
 * Reporting. Every metric has an explicit definition (also shown in the UI and docs/REPORTS.md).
 * Test/demo orders (is_test) are always excluded. Money is integer pesewas.
 */
export const METRIC_DEFINITIONS: Record<string, string> = {
  paidSales: 'Sum of verified successful payments (online + cash recorded) received in the period, before refunds.',
  refunds: 'Sum of refunds confirmed as processed in the period.',
  netPaidSales: 'Paid sales minus processed refunds.',
  grossOrderValue: 'Total value of orders placed in the period (paid or cash-confirmed), including later-cancelled ones, before refunds.',
  discounts: 'Promotion discounts on orders placed in the period.',
  deliveryFeesCharged: 'Delivery fees charged to customers on non-cancelled orders placed in the period.',
  paymentFees: 'Processing fees reported by the payment provider for payments in the period (blank when not reported).',
  deliveryCosts: 'Partner delivery fees (final if reconciled, otherwise quoted) plus in-house rider fees for deliveries completed in the period.',
  expenses: 'Other operating expenses entered manually for the period.',
  ingredientCostEstimate: 'Estimated ingredient cost from recipe deductions × latest recorded unit cost. Only where recipes and costs are configured.',
  contributionEstimate: 'Net paid sales − payment fees − delivery costs − ingredient cost estimate. An ESTIMATE, not profit.',
  aov: 'Average order value: paid sales ÷ number of paid orders in the period.',
  cancellationRate: 'Cancelled ÷ placed orders (orders that reached payment/cash confirmation).',
  onTimeRate: 'Share of orders the kitchen marked ready at or before the promised time.',
};

/** Resolve a local-date range (inclusive of `to` day) in the restaurant timezone to UTC instants. */
export function periodToUtc(fromKey: string, toKey: string, tz: string) {
  const re = /^(\d{4})-(\d{2})-(\d{2})$/;
  const a = fromKey.match(re);
  const b = toKey.match(re);
  if (!a || !b) throw invalid('Dates must be YYYY-MM-DD.');
  const from = zonedToUtc(+a[1], +a[2], +a[3], 0, 0, tz);
  const toStart = zonedToUtc(+b[1], +b[2], +b[3], 0, 0, tz);
  const to = new Date(toStart.getTime() + 86400_000);
  if (to <= from) throw invalid('End date must be on or after start date.');
  if (to.getTime() - from.getTime() > 400 * 86400_000) throw invalid('Choose a period of 400 days or less.');
  return { from, to };
}

export async function financeSummary(user: SessionUser | null, from: Date, to: Date, db: Db = sql) {
  requirePerm(user, 'finance.view');
  const [paid] = await db<{ paidSales: number; paidOrders: number; paymentFees: number | null; feesKnown: number; unreconciled: number; unreconciledAmount: number }[]>`
    select coalesce(sum(a.amount_pesewas),0)::int as paid_sales, count(distinct a.order_id)::int as paid_orders,
           sum(a.fees_pesewas)::int as payment_fees, count(a.fees_pesewas)::int as fees_known,
           count(*) filter (where a.reconciliation_status = 'unreconciled')::int as unreconciled,
           coalesce(sum(a.amount_pesewas) filter (where a.reconciliation_status = 'unreconciled'),0)::int as unreconciled_amount
    from payment_attempts a join orders o on o.id = a.order_id
    where a.status = 'successful' and not o.is_test and a.paid_at >= ${from} and a.paid_at < ${to}`;
  const [ref] = await db<{ refunds: number; count: number }[]>`
    select coalesce(sum(r.amount_pesewas),0)::int as refunds, count(*)::int as count from refunds r join orders o on o.id = r.order_id
    where r.status = 'processed' and not o.is_test and r.processed_at >= ${from} and r.processed_at < ${to}`;
  const [ord] = await db<{ gross: number; discounts: number; deliveryFees: number; placed: number; cancelled: number }[]>`
    select coalesce(sum(total_pesewas),0)::int as gross, coalesce(sum(discount_pesewas),0)::int as discounts,
           coalesce(sum(delivery_fee_pesewas) filter (where status <> 'cancelled'),0)::int as delivery_fees,
           count(*)::int as placed, count(*) filter (where status = 'cancelled')::int as cancelled
    from orders where not is_test and placed_at >= ${from} and placed_at < ${to}`;
  const [del] = await db<{ partnerCosts: number; riderCosts: number }[]>`
    select
      coalesce((select sum(coalesce(b.final_fee_pesewas, b.quoted_fee_pesewas)) from provider_bookings b join fulfillments f on f.order_id = b.order_id
                join orders o on o.id = b.order_id where b.status = 'delivered' and not o.is_test and f.delivered_at >= ${from} and f.delivered_at < ${to}),0)::int as partner_costs,
      coalesce((select sum(a.rider_fee_pesewas) from delivery_assignments a join orders o on o.id = a.order_id
                where a.status = 'completed' and not o.is_test and a.ended_at >= ${from} and a.ended_at < ${to}),0)::int as rider_costs`;
  const [exp] = await db<{ expenses: number }[]>`
    select coalesce(sum(amount_pesewas),0)::int as expenses from expenses where incurred_on >= ${from}::date and incurred_on < ${to}::date`;
  const [ing] = await db<{ cost: number; lines: number }[]>`
    select coalesce(round(sum(-m.quantity_delta * s.cost_per_unit_pesewas)),0)::int as cost, count(*)::int as lines
    from stock_movements m join stock_items s on s.id = m.stock_item_id join orders o on o.id = m.order_id
    where m.kind = 'sale' and not o.is_test and s.cost_per_unit_pesewas is not null and m.created_at >= ${from} and m.created_at < ${to}`;
  const deliveryCosts = del.partnerCosts + del.riderCosts;
  const netPaidSales = paid.paidSales - ref.refunds;
  return {
    paidSales: paid.paidSales,
    paidOrders: paid.paidOrders,
    refunds: ref.refunds,
    refundCount: ref.count,
    netPaidSales,
    grossOrderValue: ord.gross,
    discounts: ord.discounts,
    deliveryFeesCharged: ord.deliveryFees,
    paymentFees: paid.paymentFees,
    paymentFeesComplete: paid.feesKnown,
    deliveryCosts,
    expenses: exp.expenses,
    ingredientCostEstimate: ing.lines ? ing.cost : null,
    contributionEstimate: netPaidSales - (paid.paymentFees ?? 0) - deliveryCosts - (ing.lines ? ing.cost : 0),
    unreconciledPayments: paid.unreconciled,
    unreconciledAmount: paid.unreconciledAmount,
    aov: paid.paidOrders ? Math.round(paid.paidSales / paid.paidOrders) : null,
    placedOrders: ord.placed,
    cancelledOrders: ord.cancelled,
  };
}

export async function paymentsList(user: SessionUser | null, from: Date, to: Date, db: Db = sql) {
  requirePerm(user, 'payments.view');
  return db<{ id: string; orderId: string; orderNumber: string; provider: string; reference: string; amountPesewas: number; status: string; channel: string | null; feesPesewas: number | null; paidAt: Date | null; reconciliationStatus: string; settledAmountPesewas: number | null; createdAt: Date; isTest: boolean }[]>`
    select a.id, a.order_id, o.order_number, a.provider, a.reference, a.amount_pesewas, a.status, a.channel, a.fees_pesewas, a.paid_at,
           a.reconciliation_status, a.settled_amount_pesewas, a.created_at, o.is_test
    from payment_attempts a join orders o on o.id = a.order_id
    where a.created_at >= ${from} and a.created_at < ${to} and a.status <> 'initialized'
    order by a.created_at desc limit 1000`;
}

export async function addExpense(user: SessionUser | null, args: { incurredOn: string; category: string; description?: string | null; amountPesewas: number }, db: Db = sql) {
  requirePerm(user, 'finance.manage');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.incurredOn)) throw invalid('Invalid date.');
  if (!args.category?.trim()) throw invalid('Category is required.');
  if (!Number.isSafeInteger(args.amountPesewas) || args.amountPesewas <= 0) throw invalid('Amount must be positive.');
  await db`insert into expenses (incurred_on, category, description, amount_pesewas, created_by) values (${args.incurredOn}, ${args.category.trim()}, ${args.description ?? null}, ${args.amountPesewas}, ${user!.id})`;
}

export async function removeExpense(user: SessionUser | null, id: number, db: Db = sql) {
  requirePerm(user, 'finance.manage');
  if (!Number.isInteger(id) || id <= 0) throw invalid('Invalid expense.');
  const [row] = await db<{ incurredOn: Date; category: string; description: string | null; amountPesewas: number }[]>`
    delete from expenses where id = ${id} returning incurred_on, category, description, amount_pesewas`;
  if (!row) throw notFound('Expense');
  await audit(db, actorOf(user), 'finance.expense_removed', 'expense', id, { category: row.category, description: row.description, amountPesewas: row.amountPesewas, incurredOn: row.incurredOn });
}

export async function listExpenses(user: SessionUser | null, from: Date, to: Date, db: Db = sql) {
  requirePerm(user, 'finance.view');
  return db<{ id: number; incurredOn: Date; category: string; description: string | null; amountPesewas: number }[]>`
    select id, incurred_on, category, description, amount_pesewas from expenses where incurred_on >= ${from}::date and incurred_on < ${to}::date order by incurred_on desc`;
}

// ---------------------------------------------------------------------------
// Operational overview (dashboard)
// ---------------------------------------------------------------------------

export async function overview(user: SessionUser | null, db: Db = sql) {
  requirePerm(user, 'dashboard.view');
  const tz = (await getSettings('restaurant', db)).timezone;
  const p = localParts(new Date(), tz);
  const dayStart = zonedToUtc(p.year, p.month, p.day, 0, 0, tz);
  const dayEnd = new Date(dayStart.getTime() + 86400_000);
  const [counts] = await db<{
    todayOrders: number;
    attention: number;
    newOrders: number;
    preparing: number;
    readyPickup: number;
    awaitingDispatch: number;
    outForDelivery: number;
    delayed: number;
    pendingPayment: number;
    paymentExceptions: number;
  }[]>`
    select
      count(*) filter (where o.placed_at >= ${dayStart} and o.placed_at < ${dayEnd})::int as today_orders,
      count(*) filter (where o.needs_attention and o.status <> 'completed')::int as attention,
      count(*) filter (where o.kitchen_status in ('new','accepted'))::int as new_orders,
      count(*) filter (where o.kitchen_status = 'preparing')::int as preparing,
      count(*) filter (where f.status = 'ready_for_pickup')::int as ready_pickup,
      count(*) filter (where o.fulfillment_type = 'delivery' and f.status = 'unassigned' and o.status in ('placed','in_progress'))::int as awaiting_dispatch,
      count(*) filter (where f.status in ('picked_up','on_the_way','arrived'))::int as out_for_delivery,
      count(*) filter (where o.status in ('placed','in_progress') and o.kitchen_status in ('new','accepted','preparing') and o.promised_at < now())::int as delayed,
      count(*) filter (where o.status = 'pending_payment')::int as pending_payment,
      count(*) filter (where o.payment_status = 'reconciliation_required')::int as payment_exceptions
    from orders o join fulfillments f on f.order_id = o.id
    where not o.is_test and (o.status in ('pending_payment','placed','in_progress') or o.needs_attention or o.placed_at >= ${dayStart})`;
  const [sales] = await db<{ paidSales: number; paidOrders: number }[]>`
    select coalesce(sum(a.amount_pesewas),0)::int as paid_sales, count(distinct a.order_id)::int as paid_orders
    from payment_attempts a join orders o on o.id = a.order_id
    where a.status = 'successful' and not o.is_test and a.paid_at >= ${dayStart} and a.paid_at < ${dayEnd}`;
  const popular = await db<{ name: string; qty: number }[]>`
    select oi.item_name as name, sum(oi.quantity)::int as qty from order_items oi join orders o on o.id = oi.order_id
    where not o.is_test and o.status <> 'cancelled' and o.placed_at >= now() - interval '7 days'
    group by oi.item_name order by qty desc limit 5`;
  const attention = await db<{ id: string; orderNumber: string; attentionReason: string | null; updatedAt: Date }[]>`
    select id, order_number, attention_reason, updated_at from orders where needs_attention and status <> 'completed' order by updated_at desc limit 10`;
  const [{ openCases }] = await db<{ openCases: number }[]>`select count(*)::int as open_cases from support_cases where status <> 'resolved'`;
  const low = await lowStock(db);
  return {
    timezone: tz,
    dayStart,
    counts,
    sales: { ...sales, aov: sales.paidOrders ? Math.round(sales.paidSales / sales.paidOrders) : null },
    popular,
    attention,
    openCases,
    lowStock: low,
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function reports(user: SessionUser | null, from: Date, to: Date, db: Db = sql) {
  requireAnyPerm(user, ['reports.view']);
  const tz = (await getSettings('restaurant', db)).timezone;
  const daily = await db<{ day: string; orders: number; paidSales: number; cancelled: number }[]>`
    select to_char(o.placed_at at time zone ${tz}, 'YYYY-MM-DD') as day, count(*)::int as orders,
           coalesce(sum(o.total_pesewas) filter (where o.payment_status in ('paid','cash_collected','partially_refunded','refunded','refund_pending')),0)::int as paid_sales,
           count(*) filter (where o.status = 'cancelled')::int as cancelled
    from orders o where not o.is_test and o.placed_at >= ${from} and o.placed_at < ${to}
    group by 1 order by 1`;
  const byFulfillment = await db<{ fulfillmentType: string; orders: number; value: number }[]>`
    select fulfillment_type, count(*)::int as orders, coalesce(sum(total_pesewas),0)::int as value
    from orders where not is_test and status <> 'cancelled' and placed_at >= ${from} and placed_at < ${to} group by 1`;
  const bestSellers = await db<{ name: string; qty: number; revenue: number }[]>`
    select oi.item_name as name, sum(oi.quantity)::int as qty, sum(oi.line_total_pesewas)::int as revenue
    from order_items oi join orders o on o.id = oi.order_id
    where not o.is_test and o.status <> 'cancelled' and o.placed_at >= ${from} and o.placed_at < ${to}
    group by 1 order by qty desc limit 15`;
  const peakHours = await db<{ hour: number; orders: number }[]>`
    select extract(hour from o.placed_at at time zone ${tz})::int as hour, count(*)::int as orders
    from orders o where not o.is_test and o.placed_at >= ${from} and o.placed_at < ${to} group by 1 order by 1`;
  const [rates] = await db<{ placed: number; cancelled: number; refunded: number }[]>`
    select count(*)::int as placed, count(*) filter (where status = 'cancelled')::int as cancelled,
           count(*) filter (where refunded_pesewas > 0)::int as refunded
    from orders where not is_test and placed_at >= ${from} and placed_at < ${to}`;
  const [prep] = await db<{ avgPrepMinutes: number | null; readyCount: number; onTime: number }[]>`
    select round(avg(extract(epoch from (ready_at - coalesce(prep_started_at, accepted_at, placed_at))) / 60)::numeric, 1)::float8 as avg_prep_minutes,
           count(*)::int as ready_count, count(*) filter (where ready_at <= promised_at)::int as on_time
    from orders where not is_test and ready_at is not null and placed_at >= ${from} and placed_at < ${to}`;
  const [delivery] = await db<{ deliveries: number; delivered: number; failed: number; avgDeliveryMinutes: number | null }[]>`
    select count(*)::int as deliveries, count(*) filter (where f.status = 'delivered')::int as delivered,
           count(*) filter (where f.failed_at is not null)::int as failed,
           round(avg(extract(epoch from (f.delivered_at - f.picked_up_at)) / 60) filter (where f.delivered_at is not null and f.picked_up_at is not null)::numeric, 1)::float8 as avg_delivery_minutes
    from fulfillments f join orders o on o.id = f.order_id
    where f.type = 'delivery' and not o.is_test and o.status <> 'pending_payment' and o.placed_at >= ${from} and o.placed_at < ${to}`;
  const riders = await db<{ riderName: string; completed: number; failed: number; declined: number; avgMinutes: number | null }[]>`
    select u.full_name as rider_name,
           count(*) filter (where a.status = 'completed')::int as completed,
           count(*) filter (where a.status = 'failed')::int as failed,
           count(*) filter (where a.status = 'declined')::int as declined,
           round(avg(extract(epoch from (f.delivered_at - f.picked_up_at)) / 60) filter (where a.status = 'completed')::numeric, 1)::float8 as avg_minutes
    from delivery_assignments a join users u on u.id = a.rider_user_id join fulfillments f on f.order_id = a.order_id join orders o on o.id = a.order_id
    where not o.is_test and a.assigned_at >= ${from} and a.assigned_at < ${to}
    group by u.full_name order by completed desc`;
  const wastage = await db<{ name: string; unit: string; wasted: string }[]>`
    select s.name, s.unit, sum(-m.quantity_delta)::text as wasted from stock_movements m join stock_items s on s.id = m.stock_item_id
    where m.kind = 'wastage' and m.created_at >= ${from} and m.created_at < ${to} group by s.name, s.unit order by sum(-m.quantity_delta) desc limit 15`;
  const [repeat] = await db<{ customers: number; repeatCustomers: number }[]>`
    select count(*)::int as customers, count(*) filter (where n > 1)::int as repeat_customers from (
      select customer_phone, count(*) as n from orders where not is_test and status <> 'cancelled' and placed_at >= ${from} and placed_at < ${to} group by customer_phone
    ) x`;
  return {
    timezone: tz,
    daily,
    byFulfillment,
    bestSellers,
    peakHours,
    rates: { ...rates, cancellationRate: rates.placed ? rates.cancelled / rates.placed : null, refundRate: rates.placed ? rates.refunded / rates.placed : null },
    prep: { ...prep, onTimeRate: prep.readyCount ? prep.onTime / prep.readyCount : null },
    delivery,
    riders,
    wastage,
    repeat,
  };
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v == null) return '';
    let s = v instanceof Date ? v.toISOString() : String(v);
    // Prevent CSV/formula injection when opened in spreadsheet apps.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
}

export async function customersList(user: SessionUser | null, q: string | null, db: Db = sql) {
  requirePerm(user, 'customers.view');
  const like = q?.trim() ? `%${q.trim().toLowerCase()}%` : null;
  return db<{ phone: string; name: string; email: string | null; orders: number; spent: number; lastOrderAt: Date; hasAccount: boolean; cancelled: number; deliveryFailures: number; supportCases: number }[]>`
    select o.customer_phone as phone, (array_agg(o.customer_name order by o.created_at desc))[1] as name,
           (array_agg(o.customer_email order by o.created_at desc) filter (where o.customer_email is not null))[1] as email,
           count(*)::int as orders,
           coalesce(sum(o.total_pesewas - o.refunded_pesewas) filter (where o.payment_status in ('paid','cash_collected','partially_refunded')),0)::int as spent,
           max(o.created_at) as last_order_at, bool_or(o.customer_user_id is not null) as has_account,
           count(*) filter (where o.status = 'cancelled')::int as cancelled,
           count(*) filter (where f.failed_at is not null)::int as delivery_failures,
           (select count(*)::int from support_cases c where c.contact_phone = o.customer_phone) as support_cases
    from orders o join fulfillments f on f.order_id = o.id
    where not o.is_test and o.status <> 'pending_payment'
      and (${like}::text is null or lower(o.customer_name) like ${like} or o.customer_phone like ${like} or lower(coalesce(o.customer_email,'')) like ${like})
    group by o.customer_phone order by max(o.created_at) desc limit 200`;
}

export async function customerHistory(user: SessionUser | null, phone: string, db: Db = sql) {
  requirePerm(user, 'customers.view');
  return db<{ id: string; orderNumber: string; status: string; totalPesewas: number; createdAt: Date; fulfillmentType: string; paymentStatus: string }[]>`
    select id, order_number, status, total_pesewas, created_at, fulfillment_type, payment_status from orders
    where customer_phone = ${phone} order by created_at desc limit 100`;
}
