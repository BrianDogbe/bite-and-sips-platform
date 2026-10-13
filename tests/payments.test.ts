import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resetDb, done, seedFixture, orderInput, orderRow, makeUser, mockPay, latestAttempt, type Fixture } from './helpers';
import { sql } from '@/server/db';
import { createOrder } from '@/server/orders/create';
import { startPayment, applyVerification, handlePaymentWebhook, requestRefund, syncPendingRefunds, expireUnpaidOrders, verifyReference } from '@/server/payments/service';
import { signMockWebhook } from '@/server/payments/mock';
import { parsePaystackWebhook, mapPaystackTransaction, paystackProvider } from '@/server/payments/paystack';
import { hmacHex } from '@/server/ids';
import { staffCancelOrder } from '@/server/orders/lifecycle';
import { resetEnvCache } from '@/server/env';

let fx: Fixture;
after(done);
beforeEach(async () => {
  await resetDb();
  fx = await seedFixture();
});

async function newOnlineOrder(ip = '10.0.0.1') {
  const r = await createOrder(orderInput(fx), { user: null, ip });
  const p = await startPayment(r.trackingToken, { ip });
  assert.ok(p.authorizationUrl?.includes('/pay/mock/'));
  const a = await latestAttempt(r.orderId);
  return { r, a };
}

test('successful payment is applied only after verified webhook; order enters kitchen once', async () => {
  const { r, a } = await newOnlineOrder();
  let o = await orderRow(r.orderId);
  assert.equal(o.paymentStatus, 'pending');
  assert.equal(o.kitchenStatus, 'not_sent');
  const { result } = await mockPay(a.reference, 'success');
  assert.equal(result.httpStatus, 200);
  o = await orderRow(r.orderId);
  assert.equal(o.status, 'placed');
  assert.equal(o.paymentStatus, 'paid');
  assert.equal(o.kitchenStatus, 'new');
  const att = await latestAttempt(r.orderId);
  assert.equal(att.status, 'successful');
});

test('repeated webhook (same event) is a no-op; a second distinct success event has no duplicate side effects', async () => {
  const { r, a } = await newOnlineOrder();
  const first = await mockPay(a.reference, 'success', 'evt-1');
  const dup = await handlePaymentWebhook('mock', first.body, first.headers);
  assert.equal(dup.httpStatus, 200);
  assert.equal(dup.body.duplicate, true);
  await mockPay(a.reference, 'success', 'evt-2'); // different event id, same payment
  const events = await sql`select 1 from order_events where order_id = ${r.orderId} and type = 'kitchen.new'`;
  assert.equal(events.length, 1);
  const notes = await sql`select 1 from notifications where order_id = ${r.orderId} and template = 'payment_confirmed' and channel = 'in_app'`;
  assert.equal(notes.length, 1);
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from webhook_events`;
  assert.equal(n, 2);
});

test('invalid webhook signature is rejected and not processed', async () => {
  const { r, a } = await newOnlineOrder();
  await sql`update mock_transactions set status = 'success' where reference = ${a.reference}`;
  const body = JSON.stringify({ event: 'charge.success', id: 'x', data: { reference: a.reference } });
  const res = await handlePaymentWebhook('mock', body, new Headers({ 'x-mock-signature': 'deadbeef' }));
  assert.equal(res.httpStatus, 401);
  const o = await orderRow(r.orderId);
  assert.equal(o.paymentStatus, 'pending');
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from webhook_events`;
  assert.equal(n, 0);
});

test('webhook payload alone cannot mark paid: provider verification says pending → order stays unpaid', async () => {
  const { r, a } = await newOnlineOrder();
  // Signed webhook claims success but the provider-side transaction is still pending
  const body = JSON.stringify({ event: 'charge.success', id: 'forged', data: { reference: a.reference } });
  const res = await handlePaymentWebhook('mock', body, new Headers({ 'x-mock-signature': signMockWebhook(body) }));
  assert.equal(res.httpStatus, 200);
  const o = await orderRow(r.orderId);
  assert.notEqual(o.paymentStatus, 'paid');
  assert.equal(o.status, 'pending_payment');
});

test('failed payment marks failed and allows a safe retry', async () => {
  const { r, a } = await newOnlineOrder();
  await mockPay(a.reference, 'failed');
  let o = await orderRow(r.orderId);
  assert.equal(o.paymentStatus, 'failed');
  assert.equal(o.status, 'pending_payment');
  const retry = await startPayment(r.trackingToken, { ip: '10.0.0.9' });
  assert.ok(retry.authorizationUrl);
  const b = await latestAttempt(r.orderId);
  assert.notEqual(b.reference, a.reference);
  await mockPay(b.reference, 'success');
  o = await orderRow(r.orderId);
  assert.equal(o.paymentStatus, 'paid');
});

test('incorrect amount and incorrect currency are flagged for reconciliation, never marked paid', async () => {
  const { r, a } = await newOnlineOrder();
  const out = await applyVerification(
    a.reference,
    { status: 'success', reference: a.reference, amountPesewas: a.amountPesewas - 100, currency: 'GHS', transactionId: '1', channel: 'card', feesPesewas: 0, paidAt: new Date(), gatewayResponse: 'ok' },
    { userId: null, label: 'test' },
  );
  assert.equal(out.orderPaid, false);
  let o = await orderRow(r.orderId);
  assert.equal(o.paymentStatus, 'reconciliation_required');
  assert.equal(o.needsAttention, true);
  assert.equal(o.kitchenStatus, 'not_sent');

  const second = await newOnlineOrder('10.0.0.2');
  const out2 = await applyVerification(
    second.a.reference,
    { status: 'success', reference: second.a.reference, amountPesewas: second.a.amountPesewas, currency: 'NGN', transactionId: '2', channel: 'card', feesPesewas: 0, paidAt: new Date(), gatewayResponse: 'ok' },
    { userId: null, label: 'test' },
  );
  assert.equal(out2.orderPaid, false);
  o = await orderRow(second.r.orderId);
  assert.equal(o.paymentStatus, 'reconciliation_required');
});

test('pending (e.g. Mobile Money prompt open) keeps order awaiting payment; startPayment resumes instead of double-charging', async () => {
  const { r, a } = await newOnlineOrder();
  const again = await startPayment(r.trackingToken, { ip: '10.0.0.3' });
  assert.ok(again.authorizationUrl?.includes(encodeURIComponent(a.reference)));
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from payment_attempts where order_id = ${r.orderId}`;
  assert.equal(n, 1);
});

test('duplicate payment for an already-paid order is flagged for refund, not double counted', async () => {
  const { r, a } = await newOnlineOrder();
  // A second attempt created before the first completed (e.g. two tabs)
  await sql`insert into payment_attempts (order_id, provider, reference, amount_pesewas, status) values (${r.orderId}, 'mock', 'DUP-REF-1', ${a.amountPesewas}, 'pending')`;
  await sql`insert into mock_transactions (reference, amount_pesewas, currency, status) values ('DUP-REF-1', ${a.amountPesewas}, 'GHS', 'success')`;
  await mockPay(a.reference, 'success');
  await verifyReference('DUP-REF-1');
  const o = await orderRow(r.orderId);
  assert.equal(o.paymentStatus, 'paid');
  assert.equal(o.needsAttention, true);
  assert.match(o.attentionReason, /Duplicate payment/);
  const succ = await sql`select 1 from payment_attempts where order_id = ${r.orderId} and status = 'successful'`;
  assert.equal(succ.length, 1);
});

test('refunds: authorisation, validation, pending → processed via provider sync, idempotent', async () => {
  const { r, a } = await newOnlineOrder();
  await mockPay(a.reference, 'success');
  const kitchen = await makeUser(['kitchen']);
  const mgr = await makeUser(['owner']);
  const manager = await makeUser(['manager']);
  const total = (await orderRow(r.orderId)).totalPesewas;
  await assert.rejects(requestRefund(kitchen, { orderId: r.orderId, amountPesewas: 100, reason: 'x', idempotencyKey: 'k0' }), /permission/);
  await assert.rejects(requestRefund(manager, { orderId: r.orderId, amountPesewas: 100, reason: 'x', idempotencyKey: 'k0m' }), /permission/);
  await assert.rejects(requestRefund(mgr, { orderId: r.orderId, amountPesewas: total + 1, reason: 'too much', idempotencyKey: 'k1' }), /maximum refundable/);

  const key = randomUUID();
  const rf = await requestRefund(mgr, { orderId: r.orderId, amountPesewas: 1000, reason: 'Missing drink', idempotencyKey: key });
  assert.equal(rf.status, 'pending');
  let o = await orderRow(r.orderId);
  assert.equal(o.paymentStatus, 'refund_pending');
  const same = await requestRefund(mgr, { orderId: r.orderId, amountPesewas: 1000, reason: 'Missing drink', idempotencyKey: key });
  assert.equal(same.id, rf.id);

  await syncPendingRefunds();
  o = await orderRow(r.orderId);
  assert.equal(o.refundedPesewas, 1000);
  assert.equal(o.paymentStatus, 'partially_refunded');
  await syncPendingRefunds(); // no double counting
  o = await orderRow(r.orderId);
  assert.equal(o.refundedPesewas, 1000);

  await requestRefund(mgr, { orderId: r.orderId, amountPesewas: total - 1000, reason: 'Order cancelled', idempotencyKey: randomUUID() });
  await syncPendingRefunds();
  o = await orderRow(r.orderId);
  assert.equal(o.paymentStatus, 'refunded');
  await assert.rejects(requestRefund(mgr, { orderId: r.orderId, amountPesewas: 1, reason: 'more', idempotencyKey: randomUUID() }), /maximum refundable/);
  const audits = await sql`select 1 from audit_events where action like 'refund.%'`;
  assert.ok(audits.length >= 4);
});

test('staff cancel of a paid order flags a refund decision', async () => {
  const { r, a } = await newOnlineOrder();
  await mockPay(a.reference, 'success');
  const mgr = await makeUser(['manager']);
  await staffCancelOrder(mgr, r.orderId, 'Kitchen fire drill');
  const o = await orderRow(r.orderId);
  assert.equal(o.status, 'cancelled');
  assert.equal(o.needsAttention, true);
  assert.match(o.attentionReason, /refund/);
});

test('unpaid orders expire after the payment window and release their slot; late payment is flagged', async () => {
  const { r, a } = await newOnlineOrder();
  const later = new Date(Date.now() + 60 * 60_000);
  // Provider still says pending → grace period applies at +60min? (window 20 + grace 15 < 60) → cancelled
  const res = await expireUnpaidOrders(later);
  assert.equal(res.cancelled, 1);
  const o = await orderRow(r.orderId);
  assert.equal(o.status, 'cancelled');
  const [s] = await sql<{ releasedAt: Date | null }[]>`select released_at from slot_reservations where order_id = ${r.orderId}`;
  assert.ok(s.releasedAt);
  // Customer completes payment after cancellation → recorded, flagged for refund, NOT sent to kitchen
  await sql`update payment_attempts set status = 'pending' where reference = ${a.reference}`;
  await mockPay(a.reference, 'success');
  const o2 = await orderRow(r.orderId);
  assert.equal(o2.status, 'cancelled');
  assert.equal(o2.kitchenStatus, 'cancelled');
  assert.equal(o2.needsAttention, true);
  assert.match(o2.attentionReason, /after cancellation/);
});

test('Paystack adapter: signature verification (HMAC-SHA512), payload parsing and status mapping', async () => {
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_dummy_for_unit_tests';
  resetEnvCache();
  const p = paystackProvider();
  const body = JSON.stringify({ event: 'charge.success', data: { id: 302961, reference: 'BS-ABC123-XYZ', status: 'success', amount: 12000, currency: 'GHS' } });
  const good = hmacHex('sk_test_dummy_for_unit_tests', body, 'sha512');
  assert.equal(p.verifyWebhookSignature(body, new Headers({ 'x-paystack-signature': good })), true);
  assert.equal(p.verifyWebhookSignature(body, new Headers({ 'x-paystack-signature': good.replace(/^./, '0') })), false);
  assert.equal(p.verifyWebhookSignature(body + ' ', new Headers({ 'x-paystack-signature': good })), false);
  assert.equal(p.verifyWebhookSignature(body, new Headers({})), false);
  const parsed = parsePaystackWebhook(body);
  assert.equal(parsed.kind, 'charge.success');
  assert.equal(parsed.reference, 'BS-ABC123-XYZ');
  const refund = parsePaystackWebhook(JSON.stringify({ event: 'refund.processed', data: { id: 99, status: 'processed', transaction_reference: 'BS-ABC123-XYZ' } }));
  assert.equal(refund.kind, 'refund.processed');
  assert.equal(refund.refundId, '99');
  assert.equal(refund.reference, 'BS-ABC123-XYZ');
  const m = mapPaystackTransaction({ id: 1, status: 'ongoing', reference: 'r', amount: 100, currency: 'GHS', channel: 'mobile_money', fees: null, paid_at: null, gateway_response: null });
  assert.equal(m.status, 'pending');
  assert.equal(mapPaystackTransaction({ id: 1, status: 'success', reference: 'r', amount: 100, currency: 'GHS', channel: 'card', fees: 2, paid_at: '2026-01-01T00:00:00Z', gateway_response: 'Approved' }).status, 'success');
  delete process.env.PAYSTACK_SECRET_KEY;
  resetEnvCache();
});

test('provider timeout during initialisation leaves the attempt for reconciliation (no false success)', async () => {
  const r = await createOrder(orderInput(fx), { user: null, ip: '10.0.0.7' });
  process.env.PAYMENT_PROVIDER = 'paystack';
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_dummy';
  process.env.PAYSTACK_BASE_URL = 'http://127.0.0.1:9'; // closed port → network error
  resetEnvCache();
  try {
    await assert.rejects(startPayment(r.trackingToken, { ip: '10.0.0.7' }), /could not start the payment/);
    const a = await latestAttempt(r.orderId);
    assert.equal(a.status, 'initialized');
    const o = await orderRow(r.orderId);
    assert.equal(o.status, 'pending_payment');
  } finally {
    process.env.PAYMENT_PROVIDER = 'mock';
    delete process.env.PAYSTACK_SECRET_KEY;
    delete process.env.PAYSTACK_BASE_URL;
    resetEnvCache();
  }
});
