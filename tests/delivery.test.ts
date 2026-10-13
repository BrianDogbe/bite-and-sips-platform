import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resetDb, done, seedFixture, orderInput, orderRow, makeUser, RESTAURANT, type Fixture } from './helpers';
import { sql } from '@/server/db';
import { createOrder } from '@/server/orders/create';
import { kitchenAction, recordCashCollected } from '@/server/orders/lifecycle';
import {
  assignRider,
  unassignRider,
  riderRespond,
  riderAdvance,
  confirmDeliveryWithPin,
  overrideDelivery,
  failDelivery,
  resolveFailedDelivery,
  recordRiderLocation,
  customerVisibleLocation,
  deliveryPin,
  listRiders,
  riderAssignments,
  riderHeartbeat,
  purgeOldLocations,
  riderStats,
  updateRiderVehicle,
  riderCashBalances,
  recordCashHandover,
} from '@/server/fulfillment/inhouse';
import {
  requestPartnerDelivery,
  recordManualBooking,
  updateManualBookingStatus,
  cancelPartnerBooking,
  reconcileUnknownBooking,
  reconcileBookingFee,
  handlePartnerWebhook,
  registerPartnerAdapter,
  unregisterPartnerAdapter,
  sandboxSecret,
  PartnerUncertainError,
  type DeliveryPartnerAdapter,
} from '@/server/fulfillment/partners';
import { trackingView } from '@/server/orders/queries';
import { hmacHex } from '@/server/ids';
import type { SessionUser } from '@/server/auth/sessions';

let fx: Fixture;
let dispatcher: SessionUser;
let kitchen: SessionUser;
after(done);
beforeEach(async () => {
  await resetDb();
  fx = await seedFixture();
  dispatcher = await makeUser(['manager'], 'Dee Manager');
  kitchen = await makeUser(['kitchen'], 'Kay Kitchen');
});

const near = { lat: RESTAURANT.lat + 0.01, lng: RESTAURANT.lng };

async function cashDeliveryOrder(ip = '20.0.0.1') {
  const r = await createOrder(orderInput(fx, { paymentMethod: 'cash', fulfillment: { type: 'delivery', addressLine: 'House 7, Labone', landmark: 'Blue gate', ...near } }), { user: null, ip });
  return r;
}

async function readyOrder(orderId: string) {
  await kitchenAction(kitchen, orderId, 'start');
  await kitchenAction(kitchen, orderId, 'ready');
}

test('full in-house delivery: assign → accept → pick up → location → cash → PIN → delivered', async () => {
  const rider = await makeUser(['rider'], 'Rita Rider');
  const r = await cashDeliveryOrder();
  let o = await orderRow(r.orderId);
  assert.equal(o.fulfillmentStatus, 'unassigned');

  await assignRider(dispatcher, { orderId: r.orderId, riderUserId: rider.id });
  // Before accepting, the rider does not see the customer's phone/address
  let view = await riderAssignments(rider);
  assert.equal(view.assignments[0].customerPhone, null);
  assert.equal(view.assignments[0].addressLine, null);
  await riderRespond(rider, r.orderId, 'accept', null);
  view = await riderAssignments(rider);
  assert.ok(view.assignments[0].customerPhone);
  assert.equal(view.assignments[0].cashToCollectPesewas, o.totalPesewas);

  await riderAdvance(rider, r.orderId, 'at_restaurant');
  await assert.rejects(riderAdvance(rider, r.orderId, 'picked_up'), /not marked this order ready/);
  await readyOrder(r.orderId);
  await riderAdvance(rider, r.orderId, 'picked_up');
  o = await orderRow(r.orderId);
  assert.equal(o.kitchenStatus, 'handed_off');

  // Location accepted only during active delivery
  const loc = await recordRiderLocation(rider, { lat: near.lat - 0.002, lng: near.lng, accuracy: 12, recordedAt: new Date().toISOString() });
  assert.equal(loc.accepted, true);
  const cust = await customerVisibleLocation(r.orderId);
  assert.ok(cust && cust.available && !cust.stale);

  await riderAdvance(rider, r.orderId, 'on_the_way');
  const track = await trackingView(r.trackingToken);
  assert.equal(track.stage, 'on_the_way');
  assert.equal(track.pin, deliveryPin(r.orderId));
  assert.equal(track.rider?.name, 'Rita');

  await assert.rejects(confirmDeliveryWithPin(rider, r.orderId, track.pin!), /Record the cash payment/);
  await recordCashCollected(rider, r.orderId, o.totalPesewas);
  await confirmDeliveryWithPin(rider, r.orderId, track.pin!);
  o = await orderRow(r.orderId);
  assert.equal(o.status, 'completed');
  assert.equal(o.fulfillmentStatus, 'delivered');
  const after = await trackingView(r.trackingToken);
  assert.equal(after.stage, 'delivered');
  assert.equal(after.location, null, 'rider location hidden once delivery has ended');
  assert.equal(after.pin, null);
  const [a] = await sql<{ status: string }[]>`select status from delivery_assignments where order_id = ${r.orderId}`;
  assert.equal(a.status, 'completed');
});

test('offline riders cannot be assigned unless explicitly overridden; stale heartbeat counts as offline', async () => {
  const rider = await makeUser(['rider'], 'Old Session');
  await sql`update rider_profiles set last_heartbeat_at = now() - interval '30 minutes' where user_id = ${rider.id}`;
  const riders = await listRiders();
  assert.equal(riders.find((x) => x.userId === rider.id)?.online, false);
  const r = await cashDeliveryOrder();
  await assert.rejects(assignRider(dispatcher, { orderId: r.orderId, riderUserId: rider.id }), /not online/);
  await assignRider(dispatcher, { orderId: r.orderId, riderUserId: rider.id, allowOffline: true });
  const o = await orderRow(r.orderId);
  assert.equal(o.fulfillmentStatus, 'assigned');
});

test('rider declines → back to dispatch; reassignment keeps history; unrelated rider cannot act', async () => {
  const r1 = await makeUser(['rider'], 'Rider One');
  const r2 = await makeUser(['rider'], 'Rider Two');
  const r = await cashDeliveryOrder();
  await assignRider(dispatcher, { orderId: r.orderId, riderUserId: r1.id });
  await assert.rejects(riderRespond(r2, r.orderId, 'accept', null), /not assigned to you/);
  await assert.rejects(riderRespond(r1, r.orderId, 'decline', ''), /reason/);
  await riderRespond(r1, r.orderId, 'decline', 'Bike puncture');
  let o = await orderRow(r.orderId);
  assert.equal(o.fulfillmentStatus, 'unassigned');
  await assignRider(dispatcher, { orderId: r.orderId, riderUserId: r2.id });
  await riderRespond(r2, r.orderId, 'accept', null);
  // dispatcher reassigns to r1 again (before pickup)
  await assignRider(dispatcher, { orderId: r.orderId, riderUserId: r1.id, reason: 'r2 stuck in traffic' });
  const hist = await sql<{ status: string; endReason: string | null }[]>`select status, end_reason from delivery_assignments where order_id = ${r.orderId} order by assigned_at`;
  assert.deepEqual(hist.map((h) => h.status), ['declined', 'cancelled', 'offered']);
  assert.equal(hist[1].endReason, 'r2 stuck in traffic');
  await assert.rejects(riderAdvance(r2, r.orderId, 'at_restaurant'), /not assigned to you/);
  await unassignRider(dispatcher, r.orderId, 'Customer will pick up instead');
  o = await orderRow(r.orderId);
  assert.equal(o.fulfillmentStatus, 'unassigned');
});

test('PIN brute force locks the delivery; dispatcher override completes with reason', async () => {
  const rider = await makeUser(['rider']);
  const online = await createOrder(orderInput(fx, { paymentMethod: 'cash', fulfillment: { type: 'delivery', addressLine: 'x road', ...near } }), { user: null, ip: '20.0.0.5' });
  await recordCashCollected(await makeUser(['manager']), online.orderId, (await orderRow(online.orderId)).totalPesewas);
  await assignRider(dispatcher, { orderId: online.orderId, riderUserId: rider.id });
  await riderRespond(rider, online.orderId, 'accept', null);
  await readyOrder(online.orderId);
  await riderAdvance(rider, online.orderId, 'picked_up');
  const right = deliveryPin(online.orderId);
  const wrong = right === '0000' ? '1111' : '0000';
  for (let i = 0; i < 4; i++) await assert.rejects(confirmDeliveryWithPin(rider, online.orderId, wrong), /Incorrect PIN/);
  await assert.rejects(confirmDeliveryWithPin(rider, online.orderId, wrong), /Too many incorrect/);
  await assert.rejects(confirmDeliveryWithPin(rider, online.orderId, right), /Too many incorrect/);
  await assert.rejects(overrideDelivery(rider, online.orderId, 'customer confirmed by phone'), /permission/);
  await overrideDelivery(dispatcher, online.orderId, 'Customer confirmed by phone call');
  const o = await orderRow(online.orderId);
  assert.equal(o.status, 'completed');
  const [f] = await sql<{ podMethod: string }[]>`select pod_method from fulfillments where order_id = ${online.orderId}`;
  assert.equal(f.podMethod, 'override');
});

test('failed delivery → attention → reattempt or return', async () => {
  const rider = await makeUser(['rider']);
  const r = await cashDeliveryOrder();
  await assignRider(dispatcher, { orderId: r.orderId, riderUserId: rider.id });
  await riderRespond(rider, r.orderId, 'accept', null);
  await readyOrder(r.orderId);
  await riderAdvance(rider, r.orderId, 'picked_up');
  await failDelivery(rider, r.orderId, 'Customer unreachable');
  let o = await orderRow(r.orderId);
  assert.equal(o.fulfillmentStatus, 'failed');
  assert.equal(o.needsAttention, true);
  const t = await trackingView(r.trackingToken);
  assert.equal(t.stage, 'attention');
  await resolveFailedDelivery(dispatcher, r.orderId, 'unassigned', 'Customer called back');
  o = await orderRow(r.orderId);
  assert.equal(o.fulfillmentStatus, 'unassigned');
});

test('location: rejected when off duty, without active delivery, invalid or stale; stale shown as stale; purge works', async () => {
  const rider = await makeUser(['rider']);
  const nowIso = new Date().toISOString();
  const none = await recordRiderLocation(rider, { lat: 5.6, lng: -0.18, recordedAt: nowIso });
  assert.equal(none.accepted, false);
  await assert.rejects(recordRiderLocation(rider, { lat: 95, lng: 0, recordedAt: nowIso }), /Invalid location/);
  await assert.rejects(recordRiderLocation(rider, { lat: 5.6, lng: -0.18, recordedAt: new Date(Date.now() - 20 * 60_000).toISOString() }), /too old/);
  await assert.rejects(recordRiderLocation(rider, { lat: 5.6, lng: -0.18, recordedAt: new Date(Date.now() + 5 * 60_000).toISOString() }), /future/);

  const r = await cashDeliveryOrder();
  await assignRider(dispatcher, { orderId: r.orderId, riderUserId: rider.id });
  await riderRespond(rider, r.orderId, 'accept', null);
  await readyOrder(r.orderId);
  await riderAdvance(rider, r.orderId, 'picked_up');
  // a location from 5 minutes ago (e.g. phone was locked) is accepted but displayed as stale
  await recordRiderLocation(rider, { lat: 5.61, lng: -0.18, recordedAt: new Date(Date.now() - 5 * 60_000).toISOString() });
  const cust = await customerVisibleLocation(r.orderId);
  assert.ok(cust && cust.available && cust.stale === true);

  await riderHeartbeat(rider, false);
  await assert.rejects(recordRiderLocation(rider, { lat: 5.61, lng: -0.18, recordedAt: new Date().toISOString() }), /Go on duty/);

  await sql`update rider_locations set received_at = now() - interval '90 days'`;
  const purged = await purgeOldLocations();
  assert.ok(purged.deleted >= 1);
});

test('customer cannot see rider location before pickup', async () => {
  const rider = await makeUser(['rider']);
  const r = await cashDeliveryOrder();
  await assignRider(dispatcher, { orderId: r.orderId, riderUserId: rider.id });
  await riderRespond(rider, r.orderId, 'accept', null);
  await recordRiderLocation(rider, { lat: 5.61, lng: -0.18, recordedAt: new Date().toISOString() });
  assert.equal(await customerVisibleLocation(r.orderId), null);
});

// ---------------------------------------------------------------------------
// Third-party partners
// ---------------------------------------------------------------------------

function fakeAdapter(behaviour: 'ok' | 'reject' | 'timeout', calls: { n: number }): DeliveryPartnerAdapter {
  return {
    key: 'fakeco',
    label: 'FakeCo',
    simulated: true,
    capabilities: { createDelivery: true, quote: true, cancel: true, statusWebhook: false, statusPolling: false, courierDetails: true, trackingUrl: true, lookupByReference: true },
    async requestDelivery(args) {
      calls.n++;
      if (behaviour === 'timeout') throw new PartnerUncertainError('timeout');
      if (behaviour === 'reject') throw new Error('No couriers available');
      return { externalId: `FC-${args.idempotencyKey.slice(0, 6)}`, status: 'accepted', quotedFeePesewas: 1800, trackingUrl: 'https://fakeco.example/t/1' };
    },
    async lookupByReference(key) {
      return behaviour === 'timeout' ? { externalId: `FC-${key.slice(0, 6)}`, status: 'courier_assigned', quotedFeePesewas: 1800, courierName: 'Yaw' } : null;
    },
    async cancel() {
      return { cancelled: false, detail: 'Courier already en route' };
    },
  };
}

test('partner booking success; duplicate request is idempotent; status sync; fee reconciliation', async () => {
  const calls = { n: 0 };
  registerPartnerAdapter(fakeAdapter('ok', calls));
  try {
    const r = await cashDeliveryOrder();
    const key = randomUUID();
    const b1 = await requestPartnerDelivery(dispatcher, { orderId: r.orderId, provider: 'fakeco', idempotencyKey: key });
    const b2 = await requestPartnerDelivery(dispatcher, { orderId: r.orderId, provider: 'fakeco', idempotencyKey: key });
    assert.equal(b1.id, b2.id);
    assert.equal(calls.n, 1);
    await assert.rejects(requestPartnerDelivery(dispatcher, { orderId: r.orderId, provider: 'fakeco', idempotencyKey: randomUUID() }), /Remove the current rider|live partner booking/);
    let o = await orderRow(r.orderId);
    assert.equal(o.fulfillmentStatus, 'requested');
    assert.equal(o.method, 'third_party');
    const t = await trackingView(r.trackingToken);
    assert.equal(t.partner?.name, 'fakeco');
    assert.equal(t.pin, null);

    await updateManualBookingStatus(dispatcher, { orderId: r.orderId, status: 'courier_assigned', courierName: 'Yaw' });
    // cancellation refused by the partner → cancel_failed + attention, booking NOT silently dropped
    await assert.rejects(cancelPartnerBooking(dispatcher, r.orderId, 'customer cancelled'), /did not confirm/);
    o = await orderRow(r.orderId);
    assert.equal(o.needsAttention, true);
    assert.equal(o.fulfillmentStatus, 'assigned');
    await sql`update provider_bookings set status = 'courier_assigned' where order_id = ${r.orderId}`; // staff confirmed with partner it continues
    await readyOrder(r.orderId);
    await updateManualBookingStatus(dispatcher, { orderId: r.orderId, status: 'picked_up' });
    await assert.rejects(cancelPartnerBooking(dispatcher, r.orderId, 'too late'), /already picked up/);
    await recordCashCollected(await makeUser(['manager']), r.orderId, o.totalPesewas);
    await updateManualBookingStatus(dispatcher, { orderId: r.orderId, status: 'delivered', finalFeePesewas: 2000 });
    o = await orderRow(r.orderId);
    assert.equal(o.status, 'completed');
    const [bk] = await sql<{ id: string }[]>`select id from provider_bookings where order_id = ${r.orderId}`;
    const fin = await makeUser(['manager']);
    await reconcileBookingFee(fin, bk.id, 2100);
    const [f] = await sql<{ providerFeePesewas: number }[]>`select provider_fee_pesewas from fulfillments where order_id = ${r.orderId}`;
    assert.equal(f.providerFeePesewas, 2100);
  } finally {
    unregisterPartnerAdapter('fakeco');
  }
});

test('partner rejection returns order to dispatch with attention; timeout requires reconciliation before rebooking', async () => {
  const calls = { n: 0 };
  registerPartnerAdapter(fakeAdapter('reject', calls));
  const r = await cashDeliveryOrder('20.0.0.8');
  const b = await requestPartnerDelivery(dispatcher, { orderId: r.orderId, provider: 'fakeco', idempotencyKey: randomUUID() });
  assert.equal(b.status, 'rejected');
  let o = await orderRow(r.orderId);
  assert.equal(o.fulfillmentStatus, 'unassigned');
  assert.equal(o.needsAttention, true);
  unregisterPartnerAdapter('fakeco');

  registerPartnerAdapter(fakeAdapter('timeout', calls));
  try {
    const t = await requestPartnerDelivery(dispatcher, { orderId: r.orderId, provider: 'fakeco', idempotencyKey: randomUUID() });
    assert.equal(t.status, 'unknown');
    await assert.rejects(requestPartnerDelivery(dispatcher, { orderId: r.orderId, provider: 'fakeco', idempotencyKey: randomUUID() }), /live partner booking/);
    await reconcileUnknownBooking(dispatcher, t.id);
    o = await orderRow(r.orderId);
    assert.equal(o.fulfillmentStatus, 'assigned');
  } finally {
    unregisterPartnerAdapter('fakeco');
  }
});

test('manual partner fallback: recorded, labelled manual, completed by staff', async () => {
  const r = await cashDeliveryOrder('20.0.0.9');
  const key = randomUUID();
  await recordManualBooking(dispatcher, { orderId: r.orderId, providerName: 'Local courier (phone booking)', externalRef: 'WA-123', feePesewas: 1500, idempotencyKey: key });
  await recordManualBooking(dispatcher, { orderId: r.orderId, providerName: 'Local courier (phone booking)', externalRef: 'WA-123', feePesewas: 1500, idempotencyKey: key }); // duplicate click
  const bookings = await sql`select 1 from provider_bookings where order_id = ${r.orderId}`;
  assert.equal(bookings.length, 1);
  await readyOrder(r.orderId);
  await updateManualBookingStatus(dispatcher, { orderId: r.orderId, status: 'picked_up' });
  const t = await trackingView(r.trackingToken);
  assert.equal(t.partner?.manual, true);
  await recordCashCollected(await makeUser(['manager']), r.orderId, (await orderRow(r.orderId)).totalPesewas);
  await updateManualBookingStatus(dispatcher, { orderId: r.orderId, status: 'delivered' });
  const o = await orderRow(r.orderId);
  assert.equal(o.status, 'completed');
  const [f] = await sql<{ statusSource: string }[]>`select status_source from fulfillments where order_id = ${r.orderId}`;
  assert.equal(f.statusSource, 'manual');
});

test('sandbox partner webhook: signature, duplicate webhook ignored, out-of-order update ignored', async () => {
  const r = await cashDeliveryOrder('20.0.0.10');
  const b = await requestPartnerDelivery(dispatcher, { orderId: r.orderId, provider: 'sandbox', idempotencyKey: randomUUID() });
  assert.equal(b.status, 'requested');
  const send = (payload: object, sig?: string) => {
    const body = JSON.stringify(payload);
    return handlePartnerWebhook('sandbox', body, new Headers({ 'x-sandbox-signature': sig ?? hmacHex(sandboxSecret(), body, 'sha256') }));
  };
  assert.equal((await send({ eventId: 'e0', externalId: b.externalId, status: 'courier_assigned' }, 'bad')).httpStatus, 401);
  assert.equal((await send({ eventId: 'e1', externalId: b.externalId, status: 'courier_assigned', courierName: 'Kwame' })).httpStatus, 200);
  const dup = await send({ eventId: 'e1', externalId: b.externalId, status: 'courier_assigned', courierName: 'Kwame' });
  assert.equal(dup.body.duplicate, true);
  await readyOrder(r.orderId);
  await send({ eventId: 'e2', externalId: b.externalId, status: 'picked_up' });
  await send({ eventId: 'e3', externalId: b.externalId, status: 'courier_assigned' }); // late, out of order
  const o = await orderRow(r.orderId);
  assert.equal(o.fulfillmentStatus, 'picked_up');
  const t = await trackingView(r.trackingToken);
  assert.equal(t.partner?.courierName, 'Kwame');
});

test('kitchen staff can assign an online rider, but not override offline status or set a fee; other roles cannot assign', async () => {
  const rider = await makeUser(['rider'], 'Rita Rider');
  const other = await makeUser(['rider']);
  const r = await cashDeliveryOrder('20.0.0.9');
  await assert.rejects(assignRider(other, { orderId: r.orderId, riderUserId: rider.id }), /permission/);
  await assert.rejects(assignRider(kitchen, { orderId: r.orderId, riderUserId: rider.id, allowOffline: true }), /permission/);
  await assert.rejects(assignRider(kitchen, { orderId: r.orderId, riderUserId: rider.id, riderFeePesewas: 999 }), /permission/);
  await assignRider(kitchen, { orderId: r.orderId, riderUserId: rider.id });
  const o = await orderRow(r.orderId);
  assert.equal(o.fulfillmentStatus, 'assigned');
});

test('rider earnings, cash to hand in, hand-in recording and vehicle details', async () => {
  const rider = await makeUser(['rider'], 'Rita Rider');
  const owner = await makeUser(['owner']);
  const r = await cashDeliveryOrder('20.0.0.11');
  const total = (await orderRow(r.orderId)).totalPesewas;
  await assignRider(dispatcher, { orderId: r.orderId, riderUserId: rider.id, riderFeePesewas: 700 });
  await riderRespond(rider, r.orderId, 'accept', null);
  await riderAdvance(rider, r.orderId, 'at_restaurant');
  await readyOrder(r.orderId);
  await riderAdvance(rider, r.orderId, 'picked_up');
  await riderAdvance(rider, r.orderId, 'on_the_way');
  await recordCashCollected(rider, r.orderId, total);
  const track = await trackingView(r.trackingToken);
  await confirmDeliveryWithPin(rider, r.orderId, track.pin!);

  const st = await riderStats(rider);
  assert.equal(st.today.deliveries, 1);
  assert.equal(st.today.feePesewas, 700);
  assert.equal(st.week.deliveries, 1);
  assert.equal(st.month.feePesewas, 700);
  assert.equal(st.cashCollectedTodayPesewas, total);
  assert.equal(st.cashToHandInPesewas, total);
  assert.equal(st.lifetime.deliveries, 1);
  assert.equal(st.lifetime.feePesewas, 700);
  assert.equal(st.lifetime.completionRate, 100);
  assert.ok(st.lifetime.avgMinutes !== null);
  assert.ok(st.profile.memberSince);

  // Only owner/manager can settle; amounts are validated against what the rider holds.
  await assert.rejects(recordCashHandover(rider, rider.id, 100), /permission/);
  await assert.rejects(recordCashHandover(owner, rider.id, total + 1), /more than the rider is holding/);
  await assert.rejects(recordCashHandover(owner, rider.id, 0), /greater than zero/);
  assert.equal((await riderCashBalances(owner)).find((x) => x.riderUserId === rider.id)?.balancePesewas, total);
  await recordCashHandover(owner, rider.id, 100, 'part');
  assert.equal((await riderStats(rider)).cashToHandInPesewas, total - 100);
  await recordCashHandover(owner, rider.id, total - 100);
  assert.equal((await riderStats(rider)).cashToHandInPesewas, 0);

  await updateRiderVehicle(rider, { vehicleType: 'bicycle', vehiclePlate: ' GR-1234 ' });
  const prof = (await riderStats(rider)).profile;
  assert.equal(prof.vehicleType, 'bicycle');
  assert.equal(prof.vehiclePlate, 'GR-1234');
  await assert.rejects(updateRiderVehicle(rider, { vehicleType: 'helicopter' }), /valid vehicle/);
  await assert.rejects(riderStats(kitchen), /permission/);
});
