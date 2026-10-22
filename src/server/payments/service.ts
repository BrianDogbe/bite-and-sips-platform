import 'server-only';
import { sql, tx, type Db } from '../db';
import { env } from '../env';
import { conflict, invalid, notFound, DomainError } from '../errors';
import { audit, SYSTEM, type Actor } from '../audit';
import { enforceRateLimit } from '../auth/rate-limit';
import { requirePerm, actorOf } from '../auth/guard';
import type { SessionUser } from '../auth/sessions';
import { newPaymentReference } from '../ids';
import { lockOrder, setPaymentStatus, flagAttention, recordEvent, signalOrder, type OrderRow } from '../orders/core';
import { placeOrder, cancelOrder } from '../orders/lifecycle';
import { notifyOrder, kickNotificationDispatch } from '../notifications';
import { getProvider, activePaymentProvider, ProviderUncertainError, type VerifyResult } from './provider';
import { formatGHS } from '@/lib/money';
import { log } from '../log';

export interface PaymentAttempt {
  id: string;
  orderId: string;
  provider: 'paystack' | 'mock' | 'cash';
  reference: string;
  amountPesewas: number;
  currency: string;
  status: 'initialized' | 'pending' | 'successful' | 'failed' | 'abandoned' | 'expired' | 'reversed' | 'mismatch';
  providerTransactionId: string | null;
  channel: string | null;
  authorizationUrl: string | null;
  feesPesewas: number | null;
  paidAt: Date | null;
  gatewayResponse: string | null;
  reconciliationStatus: string;
  settledAmountPesewas: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const providerActor = (name: string): Actor => ({ userId: null, label: name });

// ---------------------------------------------------------------------------
// Starting a payment
// ---------------------------------------------------------------------------

/**
 * Start (or resume) online payment for an order identified by its secret tracking token.
 * Before creating a new attempt, outstanding attempts are verified with the provider so a
 * customer who already paid is never asked to pay again.
 */
export async function startPayment(trackingToken: string, ctx: { ip?: string | null }, db: Db = sql): Promise<{ authorizationUrl?: string; alreadyPaid?: boolean }> {
  await enforceRateLimit(`pay:ip:${ctx.ip ?? 'unknown'}`, 20, 10 * 60, db);
  const [order] = await db<OrderRow[]>`select * from orders where tracking_token = ${trackingToken}`;
  if (!order) throw notFound('Order');
  await enforceRateLimit(`pay:order:${order.id}`, 8, 10 * 60, db);
  if (order.paymentMethod !== 'online') throw conflict('This order is not paid online.');
  if (order.status !== 'pending_payment') {
    if (['paid', 'refund_pending', 'partially_refunded', 'refunded'].includes(order.paymentStatus)) return { alreadyPaid: true };
    throw conflict('This order can no longer be paid.');
  }
  if (order.paymentExpiresAt && new Date(order.paymentExpiresAt) < new Date()) {
    throw conflict('The time to pay for this order has run out. Please place a new order.', { code: 'payment_expired' });
  }
  const providerName = activePaymentProvider();
  if (!providerName) throw conflict('Online payment is not available right now.');
  const provider = getProvider(providerName);

  // 1. Reconcile outstanding attempts.
  const outstanding = await db<PaymentAttempt[]>`
    select * from payment_attempts where order_id = ${order.id} and status in ('initialized','pending') order by created_at desc`;
  for (const a of outstanding) {
    try {
      const r = await getProvider(a.provider as 'paystack' | 'mock').verify(a.reference);
      const applied = await applyVerification(a.reference, r, providerActor(a.provider), db);
      if (applied.orderPaid) return { alreadyPaid: true };
      // A Mobile Money prompt that is still in progress: resume it rather than risk a double charge.
      if (r.status === 'pending' && a.authorizationUrl && Date.now() - new Date(a.createdAt).getTime() < 5 * 60_000) {
        return { authorizationUrl: a.authorizationUrl };
      }
    } catch (e) {
      log.warn('payment_reverify_failed', { reference: a.reference, error: String(e) });
    }
  }

  // 2. New attempt.
  const reference = newPaymentReference(order.orderNumber);
  await db`
    insert into payment_attempts (order_id, provider, reference, amount_pesewas, currency, status)
    values (${order.id}, ${providerName}, ${reference}, ${order.totalPesewas}, 'GHS', 'initialized')`;
  try {
    const init = await provider.initialize({
      reference,
      amountPesewas: order.totalPesewas,
      currency: 'GHS',
      email: order.customerEmail ?? '',
      callbackUrl: `${env().APP_URL}/checkout/return`,
      metadata: { order_number: order.orderNumber, order_id: order.id },
    });
    await tx(async (t) => {
      await t`update payment_attempts set authorization_url = ${init.authorizationUrl}, status = 'pending', updated_at = now() where reference = ${reference}`;
      const locked = await lockOrder(t, order.id);
      if (locked.paymentStatus === 'unpaid' || locked.paymentStatus === 'failed') {
        await setPaymentStatus(t, locked, 'pending', providerActor(providerName), 'Payment started', { reference });
      }
    }, db);
    return { authorizationUrl: init.authorizationUrl };
  } catch (e) {
    if (e instanceof ProviderUncertainError) {
      // Leave as 'initialized': the reconciliation job / next attempt will verify it.
      log.warn('payment_init_uncertain', { reference, error: e.message });
    } else {
      await db`update payment_attempts set status = 'failed', gateway_response = ${String((e as Error).message).slice(0, 300)}, updated_at = now() where reference = ${reference}`;
      log.error('payment_init_failed', { reference, error: String(e) });
    }
    throw new DomainError('payment_unavailable', 'We could not start the payment. Please try again in a moment.', 502);
  }
}

// ---------------------------------------------------------------------------
// Verification (the only path that can mark an order paid)
// ---------------------------------------------------------------------------

export async function verifyReference(reference: string, actor: Actor = SYSTEM, db: Db = sql) {
  const [a] = await db<PaymentAttempt[]>`select * from payment_attempts where reference = ${reference}`;
  if (!a) throw notFound('Payment');
  if (a.provider === 'cash') return { orderPaid: true, attemptStatus: a.status };
  const r = await getProvider(a.provider).verify(reference);
  return applyVerification(reference, r, actor, db);
}

/**
 * Apply a provider verification result. Idempotent and safe under concurrent webhook +
 * redirect + reconciliation calls (row locks on the attempt and the order).
 */
export async function applyVerification(
  reference: string,
  r: VerifyResult,
  actor: Actor,
  db: Db = sql,
): Promise<{ orderPaid: boolean; attemptStatus: PaymentAttempt['status'] }> {
  const result = await tx(async (t) => {
    const [a] = await t<PaymentAttempt[]>`select * from payment_attempts where reference = ${reference} for update`;
    if (!a) throw notFound('Payment');
    let order = await lockOrder(t, a.orderId);
    const paidStatuses = ['paid', 'refund_pending', 'partially_refunded', 'refunded'];

    if (a.status === 'successful') return { orderPaid: true, attemptStatus: a.status };
    if (r.reference !== reference) throw invalid('Verification reference mismatch.');

    const snapshot = {
      status: r.status,
      amountPesewas: r.amountPesewas,
      currency: r.currency,
      transactionId: r.transactionId,
      channel: r.channel,
      gatewayResponse: r.gatewayResponse,
      verifiedAt: new Date().toISOString(),
    };

    if (r.status === 'success') {
      const amountOk = r.amountPesewas === a.amountPesewas && a.amountPesewas === order.totalPesewas;
      const currencyOk = (r.currency ?? '').toUpperCase() === 'GHS' && a.currency === 'GHS';
      if (!amountOk || !currencyOk) {
        await t`update payment_attempts set status = 'mismatch', verification = ${t.json(snapshot as never)},
                  provider_transaction_id = ${r.transactionId}, gateway_response = 'amount/currency mismatch', updated_at = now()
                where id = ${a.id}`;
        order = await setPaymentStatus(t, order, 'reconciliation_required', actor, 'Payment amount or currency did not match the order', snapshot);
        await flagAttention(t, order.id, `Payment mismatch: received ${r.amountPesewas ?? '?'} ${r.currency ?? '?'} for order total ${order.totalPesewas} GHS`, actor);
        await audit(t, actor, 'payment.mismatch', 'payment_attempt', a.id, snapshot);
        await signalOrder(t, order);
        return { orderPaid: false, attemptStatus: 'mismatch' as const };
      }
      const other = await t`select id from payment_attempts where order_id = ${order.id} and status = 'successful' and id <> ${a.id}`;
      if (other.length) {
        await t`update payment_attempts set status = 'mismatch', gateway_response = 'duplicate payment for an already-paid order',
                  verification = ${t.json(snapshot as never)}, provider_transaction_id = ${r.transactionId}, paid_at = ${r.paidAt}, updated_at = now()
                where id = ${a.id}`;
        await flagAttention(t, order.id, `Duplicate payment received (${reference}). Refund the extra charge.`, actor);
        await audit(t, actor, 'payment.duplicate', 'payment_attempt', a.id, snapshot);
        await signalOrder(t, order);
        return { orderPaid: true, attemptStatus: 'mismatch' as const };
      }
      await t`
        update payment_attempts set status = 'successful', provider_transaction_id = ${r.transactionId}, channel = ${r.channel},
          fees_pesewas = ${r.feesPesewas}, paid_at = ${r.paidAt ?? new Date()}, gateway_response = ${r.gatewayResponse},
          verification = ${t.json(snapshot as never)}, updated_at = now()
        where id = ${a.id}`;
      await audit(t, actor, 'payment.verified', 'payment_attempt', a.id, { reference, amountPesewas: r.amountPesewas });
      if (order.status === 'cancelled') {
        order = await setPaymentStatus(t, order, 'paid', actor, 'Payment received after the order was cancelled', snapshot);
        await flagAttention(t, order.id, 'Payment received after cancellation — refund required', actor);
        await signalOrder(t, order);
        return { orderPaid: true, attemptStatus: 'successful' as const };
      }
      if (!paidStatuses.includes(order.paymentStatus)) {
        order = await setPaymentStatus(t, order, 'paid', actor, `Payment verified (${r.channel ?? 'online'})`, { reference });
      }
      await t`update payment_attempts set status = 'abandoned', updated_at = now()
              where order_id = ${order.id} and id <> ${a.id} and status in ('initialized','pending')`;
      order = await placeOrder(t, order, actor, reference);
      return { orderPaid: true, attemptStatus: 'successful' as const };
    }

    if (r.status === 'failed' || r.status === 'abandoned') {
      await t`update payment_attempts set status = ${r.status}, gateway_response = ${r.gatewayResponse},
                verification = ${t.json(snapshot as never)}, updated_at = now() where id = ${a.id}`;
      const stillOpen = await t`select 1 from payment_attempts where order_id = ${order.id} and status in ('initialized','pending')`;
      if (order.status === 'pending_payment' && !stillOpen.length && !paidStatuses.includes(order.paymentStatus)) {
        order = await setPaymentStatus(t, order, 'failed', actor, r.gatewayResponse ?? 'Payment not completed', { reference });
        if (r.status === 'failed') await notifyOrder(t, order, 'payment_failed', reference);
      }
      await signalOrder(t, order);
      return { orderPaid: false, attemptStatus: r.status };
    }

    if (r.status === 'reversed') {
      await t`update payment_attempts set status = 'reversed', verification = ${t.json(snapshot as never)}, updated_at = now() where id = ${a.id}`;
      await flagAttention(t, order.id, `Payment ${reference} was reversed by the provider`, actor);
      return { orderPaid: false, attemptStatus: 'reversed' as const };
    }

    if (r.status === 'pending' && a.status === 'initialized') {
      await t`update payment_attempts set status = 'pending', updated_at = now() where id = ${a.id}`;
      return { orderPaid: false, attemptStatus: 'pending' as const };
    }
    return { orderPaid: false, attemptStatus: a.status };
  }, db);
  kickNotificationDispatch();
  return result;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export async function handlePaymentWebhook(
  providerName: 'paystack' | 'mock',
  rawBody: string,
  headers: Headers,
  db: Db = sql,
): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  let provider;
  try {
    provider = getProvider(providerName);
  } catch {
    return { httpStatus: 404, body: { error: 'unknown provider' } };
  }
  if (!provider.verifyWebhookSignature(rawBody, headers)) {
    log.warn('webhook_invalid_signature', { provider: providerName });
    return { httpStatus: 401, body: { error: 'invalid signature' } };
  }
  let parsed;
  try {
    parsed = provider.parseWebhook(rawBody);
  } catch {
    return { httpStatus: 400, body: { error: 'malformed payload' } };
  }

  const inserted = await db<{ id: string }[]>`
    insert into webhook_events (provider, dedupe_key, event_type, signature_valid, payload)
    values (${providerName}, ${parsed.dedupeKey}, ${parsed.eventType}, true, ${db.json(parsed.payload as never)})
    on conflict (provider, dedupe_key) do nothing returning id`;
  let eventId = inserted[0]?.id;
  if (!eventId) {
    const [prev] = await db<{ id: string; processedAt: Date | null }[]>`
      select id, processed_at from webhook_events where provider = ${providerName} and dedupe_key = ${parsed.dedupeKey}`;
    if (prev?.processedAt) return { httpStatus: 200, body: { ok: true, duplicate: true } };
    eventId = prev?.id;
  }

  try {
    if ((parsed.kind === 'charge.success' || parsed.kind === 'charge.failed') && parsed.reference) {
      const known = await db`select 1 from payment_attempts where reference = ${parsed.reference}`;
      if (known.length) await verifyReference(parsed.reference, providerActor(providerName), db);
    } else if (parsed.kind.startsWith('refund')) {
      await syncRefundFromWebhook(providerName, parsed.refundId, parsed.reference, db);
    }
    await db`update webhook_events set processed_at = now(), processing_error = null where id = ${eventId}`;
    return { httpStatus: 200, body: { ok: true } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db`update webhook_events set processing_error = ${msg.slice(0, 500)} where id = ${eventId}`;
    log.error('webhook_processing_failed', { provider: providerName, event: parsed.eventType, error: msg });
    // 500 so the provider retries; processing is idempotent.
    return { httpStatus: 500, body: { error: 'processing failed' } };
  }
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export interface RefundRow {
  id: string;
  orderId: string;
  paymentAttemptId: string;
  amountPesewas: number;
  reason: string;
  status: 'requested' | 'pending' | 'processed' | 'failed' | 'manual';
  providerRefundId: string | null;
  idempotencyKey: string;
  failureReason: string | null;
  createdAt: Date;
  processedAt: Date | null;
}

export async function refundableAmount(t: Db, orderId: string) {
  const [paid] = await t<{ attemptId: string | null; provider: string | null; reference: string | null; amount: number | null }[]>`
    select id as attempt_id, provider, reference, amount_pesewas as amount
    from payment_attempts where order_id = ${orderId} and status = 'successful' limit 1`;
  if (!paid?.attemptId) return { attempt: null, refundable: 0 };
  const [{ committed }] = await t<{ committed: number }[]>`
    select coalesce(sum(amount_pesewas), 0)::int as committed from refunds
    where order_id = ${orderId} and status in ('requested','pending','processed','manual')`;
  return { attempt: paid, refundable: Math.max(0, (paid.amount ?? 0) - committed) };
}

/**
 * Request a full or partial refund. Requires payments.refund. Idempotent on `idempotencyKey`.
 * A refund is only marked processed when the provider confirms it (or, for cash, when staff record it).
 */
export async function requestRefund(
  user: SessionUser | null,
  args: { orderId: string; amountPesewas: number; reason: string; idempotencyKey: string },
  db: Db = sql,
): Promise<RefundRow> {
  requirePerm(user, 'payments.refund');
  return createRefundInternal(actorOf(user), args, db);
}

/**
 * Internal refund creation (no permission check). Used by `requestRefund` after authorisation,
 * and by the customer self-cancellation flow (policy: full refund when cancelled before preparation).
 */
export async function createRefundInternal(
  actor: Actor,
  args: { orderId: string; amountPesewas: number; reason: string; idempotencyKey: string },
  db: Db = sql,
): Promise<RefundRow> {
  if (!Number.isSafeInteger(args.amountPesewas) || args.amountPesewas <= 0) throw invalid('Refund amount must be greater than zero.');
  if (!args.reason?.trim()) throw invalid('A refund reason is required.');

  const existing = await db<RefundRow[]>`select * from refunds where idempotency_key = ${args.idempotencyKey}`;
  if (existing[0]) return existing[0];

  const refund = await tx(async (t) => {
    let order = await lockOrder(t, args.orderId);
    const { attempt, refundable } = await refundableAmount(t, order.id);
    if (!attempt) throw conflict('There is no verified payment to refund on this order.');
    if (args.amountPesewas > refundable) throw conflict(`The maximum refundable amount is ${formatGHS(refundable)}.`);
    const isCash = attempt.provider === 'cash';
    const [row] = await t<RefundRow[]>`
      insert into refunds (order_id, payment_attempt_id, amount_pesewas, reason, status, idempotency_key, requested_by)
      values (${order.id}, ${attempt.attemptId}, ${args.amountPesewas}, ${args.reason.trim()}, ${isCash ? 'manual' : 'requested'}, ${args.idempotencyKey}, ${actor.userId})
      returning *`;
    if (!isCash) {
      order = await setPaymentStatus(t, order, 'refund_pending', actor, `Refund of ${formatGHS(args.amountPesewas)} requested`, { refundId: row.id });
      await notifyOrder(t, order, 'refund_requested', row.id, { amount: formatGHS(args.amountPesewas) });
    }
    await recordEvent(t, order.id, actor, { domain: 'payment', type: 'refund.requested', message: args.reason.trim(), data: { refundId: row.id, amountPesewas: args.amountPesewas } });
    await audit(t, actor, 'refund.requested', 'order', order.id, { refundId: row.id, amountPesewas: args.amountPesewas, reason: args.reason });
    await signalOrder(t, order);
    return { row, isCash, provider: attempt.provider as 'paystack' | 'mock' | 'cash', reference: attempt.reference! };
  }, db);

  if (refund.isCash) {
    await finalizeRefund(refund.row.id, 'processed', actor, db, 'Cash refund recorded by staff');
    return (await db<RefundRow[]>`select * from refunds where id = ${refund.row.id}`)[0];
  }

  try {
    const res = await getProvider(refund.provider as 'paystack' | 'mock').createRefund({
      reference: refund.reference,
      amountPesewas: args.amountPesewas,
      idempotencyKey: args.idempotencyKey,
      reason: args.reason,
    });
    await db`update refunds set status = 'pending', provider_refund_id = ${res.refundId} where id = ${refund.row.id}`;
    if (res.status !== 'pending') await finalizeRefund(refund.row.id, res.status, actor, db);
  } catch (e) {
    if (e instanceof ProviderUncertainError) {
      await db`update refunds set failure_reason = 'Provider did not respond — check the provider dashboard before retrying' where id = ${refund.row.id}`;
      await tx((t) => flagAttention(t, args.orderId, 'Refund request outcome unknown — verify in the payment provider dashboard', actor), db);
    } else {
      await finalizeRefund(refund.row.id, 'failed', actor, db, (e as Error).message);
    }
  }
  kickNotificationDispatch();
  return (await db<RefundRow[]>`select * from refunds where id = ${refund.row.id}`)[0];
}

export async function finalizeRefund(refundId: string, status: 'processed' | 'failed', actor: Actor, db: Db = sql, note?: string) {
  await tx(async (t) => {
    const [r] = await t<RefundRow[]>`select * from refunds where id = ${refundId} for update`;
    if (!r) throw notFound('Refund');
    if (r.status === 'processed' || r.status === 'failed') return;
    if (r.status === 'manual' && status !== 'processed') return;
    let order = await lockOrder(t, r.orderId);
    if (status === 'processed') {
      await t`update refunds set status = 'processed', processed_at = now(), failure_reason = null where id = ${r.id}`;
      await t`update orders set refunded_pesewas = refunded_pesewas + ${r.amountPesewas}, updated_at = now() where id = ${order.id}`;
      order = await lockOrder(t, order.id);
      await notifyOrder(t, order, 'refund_processed', r.id, { amount: formatGHS(r.amountPesewas) });
    } else {
      await t`update refunds set status = 'failed', failure_reason = ${note ?? 'Provider reported failure'} where id = ${r.id}`;
      await flagAttention(t, order.id, `Refund of ${formatGHS(r.amountPesewas)} failed: ${note ?? 'provider reported failure'}`, actor);
    }
    await recordEvent(t, order.id, actor, { domain: 'payment', type: `refund.${status}`, message: note, customerVisible: status === 'processed', data: { refundId: r.id } });
    await recomputeRefundStatus(t, order, actor);
    await audit(t, actor, `refund.${status}`, 'order', order.id, { refundId: r.id, amountPesewas: r.amountPesewas });
    await signalOrder(t, order);
  }, db);
  kickNotificationDispatch();
}

async function recomputeRefundStatus(t: Db, order: OrderRow, actor: Actor) {
  const [{ pending }] = await t<{ pending: number }[]>`select count(*)::int as pending from refunds where order_id = ${order.id} and status in ('requested','pending')`;
  const fresh = await lockOrder(t, order.id);
  let next: OrderRow['paymentStatus'];
  if (pending > 0) next = 'refund_pending';
  else if (fresh.refundedPesewas >= fresh.totalPesewas) next = 'refunded';
  else if (fresh.refundedPesewas > 0) next = 'partially_refunded';
  else next = fresh.paymentMethod === 'cash' ? 'cash_collected' : 'paid';
  if (fresh.paymentStatus !== next && fresh.paymentStatus !== 'reconciliation_required') await setPaymentStatus(t, fresh, next, actor);
}

async function syncRefundFromWebhook(providerName: string, refundId: string | null, reference: string | null, db: Db) {
  let rows: RefundRow[] = [];
  if (refundId) rows = await db<RefundRow[]>`select * from refunds where provider_refund_id = ${refundId}`;
  if (!rows.length && reference) {
    rows = await db<RefundRow[]>`
      select r.* from refunds r join payment_attempts a on a.id = r.payment_attempt_id
      where a.reference = ${reference} and r.status in ('requested','pending') order by r.created_at`;
  }
  for (const r of rows) await syncRefund(r.id, providerActor(providerName), db);
}

/** Poll the provider for a refund's final status (used by webhook handler, jobs runner and the admin "check" button). */
export async function syncRefund(refundId: string, actor: Actor = SYSTEM, db: Db = sql) {
  const [r] = await db<(RefundRow & { provider: 'paystack' | 'mock' | 'cash' })[]>`
    select r.*, a.provider from refunds r join payment_attempts a on a.id = r.payment_attempt_id where r.id = ${refundId}`;
  if (!r || !r.providerRefundId || !['requested', 'pending'].includes(r.status) || r.provider === 'cash') return r?.status;
  const res = await getProvider(r.provider).getRefund(r.providerRefundId);
  if (res.status !== 'pending') await finalizeRefund(r.id, res.status, actor, db);
  return res.status;
}

// ---------------------------------------------------------------------------
// Reconciliation & background jobs
// ---------------------------------------------------------------------------

export async function reconcileAttempt(
  user: SessionUser | null,
  attemptId: string,
  args: { status: 'matched' | 'discrepancy'; settledAmountPesewas?: number | null; note?: string },
  db: Db = sql,
) {
  requirePerm(user, 'payments.reconcile');
  const actor = actorOf(user);
  await tx(async (t) => {
    const [a] = await t<PaymentAttempt[]>`select * from payment_attempts where id = ${attemptId} for update`;
    if (!a) throw notFound('Payment');
    if (a.status !== 'successful') throw conflict('Only successful payments can be reconciled.');
    await t`update payment_attempts set reconciliation_status = ${args.status}, settled_amount_pesewas = ${args.settledAmountPesewas ?? null},
              reconciliation_note = ${args.note ?? null}, reconciled_at = now(), reconciled_by = ${actor.userId}, updated_at = now()
            where id = ${a.id}`;
    await audit(t, actor, 'payment.reconciled', 'payment_attempt', a.id, args);
  }, db);
}

/** Re-verify attempts that have been pending for a while (covers missed webhooks). */
export async function syncPendingPayments(db: Db = sql) {
  const rows = await db<{ reference: string }[]>`
    select reference from payment_attempts
    where provider <> 'cash' and status in ('initialized','pending') and created_at < now() - interval '2 minutes'
      and created_at > now() - interval '2 days'
    order by created_at limit 50`;
  let checked = 0;
  for (const r of rows) {
    try {
      await verifyReference(r.reference, SYSTEM, db);
      checked++;
    } catch (e) {
      log.warn('sync_pending_payment_failed', { reference: r.reference, error: String(e) });
    }
  }
  return { checked };
}

export async function syncPendingRefunds(db: Db = sql) {
  const rows = await db<{ id: string }[]>`select id from refunds where status = 'pending' and provider_refund_id is not null order by created_at limit 50`;
  for (const r of rows) {
    try {
      await syncRefund(r.id, SYSTEM, db);
    } catch (e) {
      log.warn('sync_refund_failed', { id: r.id, error: String(e) });
    }
  }
  return { checked: rows.length };
}

/**
 * Cancel online orders whose payment window has passed. Outstanding attempts are verified first;
 * attempts still pending at the provider (e.g. a Mobile Money prompt) get a grace period.
 */
export async function expireUnpaidOrders(now = new Date(), db: Db = sql) {
  const rows = await db<{ id: string; paymentExpiresAt: Date; createdAt: Date }[]>`
    select id, payment_expires_at, created_at from orders
    where status = 'pending_payment' and payment_method = 'online' and payment_expires_at < ${now}
    order by payment_expires_at limit 50`;
  let cancelled = 0;
  for (const o of rows) {
    const attempts = await db<{ reference: string; provider: 'paystack' | 'mock' }[]>`
      select reference, provider from payment_attempts where order_id = ${o.id} and status in ('initialized','pending')`;
    let providerPending = false;
    let paid = false;
    for (const a of attempts) {
      try {
        const r = await getProvider(a.provider).verify(a.reference);
        const applied = await applyVerification(a.reference, r, SYSTEM, db);
        if (applied.orderPaid) paid = true;
        if (r.status === 'pending') providerPending = true;
      } catch (e) {
        providerPending = true; // unknown — do not cancel yet
        log.warn('expire_verify_failed', { reference: a.reference, error: String(e) });
      }
    }
    if (paid) continue;
    const graceOver = now.getTime() - new Date(o.paymentExpiresAt).getTime() > 15 * 60_000;
    if (providerPending && !graceOver) continue;
    try {
      await cancelOrder(o.id, SYSTEM, { reason: 'Payment was not completed in time', by: 'system' }, db);
      cancelled++;
    } catch (e) {
      log.warn('expire_cancel_failed', { orderId: o.id, error: String(e) });
    }
  }
  return { cancelled };
}

export async function paymentsForOrder(orderId: string, db: Db = sql) {
  const attempts = await db<PaymentAttempt[]>`select * from payment_attempts where order_id = ${orderId} order by created_at`;
  const refunds = await db<RefundRow[]>`select * from refunds where order_id = ${orderId} order by created_at`;
  return { attempts, refunds };
}
