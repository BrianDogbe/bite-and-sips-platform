import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, done, seedFixture, orderInput, orderRow, makeUser, type Fixture } from './helpers';
import { sql } from '@/server/db';
import { quote } from '@/server/pricing';
import { createOrder } from '@/server/orders/create';
import { availableSlots } from '@/server/scheduling';
import { getSettings, updateSettings } from '@/server/settings';
import { kitchenAction, markPickupCollected, recordCashCollected, cancelOrder, customerCancelByToken } from '@/server/orders/lifecycle';
import { trackingView } from '@/server/orders/queries';
import { RESTAURANT } from './helpers';

let fx: Fixture;
before(async () => {});
after(done);
beforeEach(async () => {
  await resetDb();
  fx = await seedFixture();
});

test('quote prices variants and modifiers from the database', async () => {
  const q = await quote({
    items: [
      { menuItemId: fx.jollofId, variantId: fx.jollofLarge, modifierIds: [fx.fish, fx.extraEgg], quantity: 2 },
      { menuItemId: fx.drinkId, modifierIds: [], quantity: 3 },
    ],
  });
  assert.equal(q.problems.length, 0);
  // (7000 + 2000 + 500) * 2 + 1200 * 3
  assert.equal(q.subtotalPesewas, 19000 + 3600);
  assert.equal(q.totalPesewas, 22600);
  assert.equal(q.maxPrepMinutes, 20);
});

test('quote rejects missing required modifier, unknown modifier, sold-out modifier and sold-out item', async () => {
  const q = await quote({
    items: [
      { menuItemId: fx.jollofId, variantId: fx.jollofRegular, modifierIds: [], quantity: 1 },
      { menuItemId: fx.jollofId, variantId: fx.jollofRegular, modifierIds: [fx.chicken, 99999], quantity: 1 },
      { menuItemId: fx.jollofId, variantId: fx.jollofRegular, modifierIds: [fx.soldOutProtein], quantity: 1 },
      { menuItemId: fx.soldOutId, modifierIds: [], quantity: 1 },
      { menuItemId: fx.jollofId, variantId: null, modifierIds: [fx.chicken], quantity: 1 },
      { menuItemId: fx.jollofId, variantId: fx.jollofRegular, modifierIds: [fx.chicken, fx.fish], quantity: 1 },
    ],
  });
  assert.deepEqual(
    q.problems.map((p) => p.code),
    ['modifier_rules', 'invalid_modifier', 'unavailable', 'unavailable', 'invalid_variant', 'modifier_rules'],
  );
});

test('service charge and tax are applied from settings with exact rounding', async () => {
  await updateSettings('ordering', { serviceChargeBps: 250, taxBps: 1500 }, null);
  const q = await quote({ items: [{ menuItemId: fx.drinkId, modifierIds: [], quantity: 1 }] });
  assert.equal(q.serviceChargePesewas, 30); // 2.5% of 1200
  assert.equal(q.taxPesewas, 185); // 15% of 1230 = 184.5 -> 185
  assert.equal(q.totalPesewas, 1200 + 30 + 185);
});

test('online pickup order: created awaiting payment with immutable snapshots; client prices are ignored', async () => {
  const input = orderInput(fx);
  (input.items[0] as Record<string, unknown>).unitPricePesewas = 1; // attacker-supplied — must be ignored
  const r = await createOrder(input, { user: null, ip: '1.1.1.1' });
  assert.equal(r.status, 'pending_payment');
  assert.equal(r.totalPesewas, (7000 + 1500 + 800) * 2 + 1200);
  const o = await orderRow(r.orderId);
  assert.equal(o.paymentStatus, 'unpaid');
  assert.equal(o.kitchenStatus, 'not_sent');
  const items = await sql<{ itemName: string; unitPricePesewas: number; modifiers: { name: string }[] }[]>`select * from order_items where order_id = ${r.orderId} order by sort_order`;
  assert.equal(items[0].itemName, 'Jollof Rice');
  assert.deepEqual(items[0].modifiers.map((m) => m.name), ['Chicken', 'Plantain']);
  // Changing the menu price later does not rewrite history
  await sql`update menu_variants set price_pesewas = 99999 where id = ${fx.jollofLarge}`;
  const again = await sql<{ unitPricePesewas: number }[]>`select unit_price_pesewas from order_items where order_id = ${r.orderId} order by sort_order`;
  assert.equal(again[0].unitPricePesewas, 9300);
  assert.match(r.orderNumber, /^BS-[2-9A-Z]{6}$/);
  assert.ok(r.trackingToken.length >= 40);
});

test('duplicate submission with the same idempotency key returns the same order (sequential and concurrent)', async () => {
  const input = orderInput(fx);
  const [a, b, c] = await Promise.all([
    createOrder(input, { user: null, ip: '1.1.1.1' }),
    createOrder(input, { user: null, ip: '1.1.1.1' }),
    createOrder(input, { user: null, ip: '1.1.1.1' }),
  ]);
  assert.equal(a.orderId, b.orderId);
  assert.equal(b.orderId, c.orderId);
  const d = await createOrder(input, { user: null, ip: '1.1.1.1' });
  assert.equal(d.orderId, a.orderId);
  assert.equal(d.duplicate, true);
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from orders`;
  assert.equal(n, 1);
  const [{ r }] = await sql<{ r: number }[]>`select count(*)::int as r from slot_reservations`;
  assert.equal(r, 1);
});

test('unavailable items cannot be ordered', async () => {
  await assert.rejects(
    createOrder(orderInput(fx, { items: [{ menuItemId: fx.soldOutId, modifierIds: [], quantity: 1 }] }), { user: null, ip: '1.1.1.2' }),
    (e: Error & { status?: number }) => e.status === 409,
  );
});

test('pickup slot capacity is enforced under concurrency', async () => {
  await updateSettings('ordering', { slotCapacity: 2 }, null);
  const s = await getSettings('ordering');
  const slots = await availableSlots({ tz: 'Africa/Accra', kind: 'pickup', prepMinutes: 20, settings: s });
  const target = slots[3].start;
  const attempts = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) =>
      createOrder(orderInput(fx, { contact: { name: 'Kofi', phone: `02412345${10 + i}`, email: 'k@example.com' }, fulfillment: { type: 'pickup', slot: target } }), { user: null, ip: `2.2.2.${i}` }),
    ),
  );
  const ok = attempts.filter((a) => a.status === 'fulfilled');
  const failed = attempts.filter((a) => a.status === 'rejected') as PromiseRejectedResult[];
  assert.equal(ok.length, 2);
  assert.equal(failed.length, 3);
  for (const f of failed) assert.match(f.reason.message, /filled up|no longer available/);
  const after = await availableSlots({ tz: 'Africa/Accra', kind: 'pickup', prepMinutes: 20, settings: s });
  assert.equal(after.find((x) => x.start === target)?.available, false);
});

test('expired / invalid pickup slots are rejected', async () => {
  const past = new Date(Date.now() - 3600_000).toISOString();
  await assert.rejects(createOrder(orderInput(fx, { fulfillment: { type: 'pickup', slot: past } }), { user: null, ip: '3.3.3.3' }), /no longer available/);
  const odd = new Date(Date.now() + 2 * 3600_000 + 7 * 60_000);
  odd.setUTCSeconds(13);
  await assert.rejects(createOrder(orderInput(fx, { fulfillment: { type: 'pickup', slot: odd.toISOString() } }), { user: null, ip: '3.3.3.3' }), /no longer available/);
});

test('delivery: inside zone priced by smallest zone; outside zone rejected; minimum order enforced; manual zone is unverified', async () => {
  const near = { lat: RESTAURANT.lat + 0.01, lng: RESTAURANT.lng }; // ~1.1km
  const mid = { lat: RESTAURANT.lat + 0.05, lng: RESTAURANT.lng }; // ~5.5km
  const far = { lat: RESTAURANT.lat + 0.2, lng: RESTAURANT.lng }; // ~22km
  const r = await createOrder(orderInput(fx, { fulfillment: { type: 'delivery', addressLine: 'House 4, Osu', ...near } }), { user: null, ip: '4.4.4.1' });
  const o = await orderRow(r.orderId);
  assert.equal(o.deliveryFeePesewas, 1000);
  const [f] = await sql<{ zoneName: string; locationVerified: boolean }[]>`select zone_name, location_verified from fulfillments where order_id = ${r.orderId}`;
  assert.equal(f.zoneName, 'Inner');
  assert.equal(f.locationVerified, true);

  await assert.rejects(
    createOrder(orderInput(fx, { fulfillment: { type: 'delivery', addressLine: 'Far away', ...far } }), { user: null, ip: '4.4.4.2' }),
    /outside our delivery area/,
  );
  await assert.rejects(
    createOrder(orderInput(fx, { items: [{ menuItemId: fx.drinkId, modifierIds: [], quantity: 1 }], fulfillment: { type: 'delivery', addressLine: 'Mid', ...mid } }), { user: null, ip: '4.4.4.3' }),
    /minimum order/,
  );
  const manual = await createOrder(orderInput(fx, { fulfillment: { type: 'delivery', addressLine: 'Near the big tree', zoneId: fx.zoneInner } }), { user: null, ip: '4.4.4.4' });
  const [mf] = await sql<{ locationVerified: boolean }[]>`select location_verified from fulfillments where order_id = ${manual.orderId}`;
  assert.equal(mf.locationVerified, false);
});

test('cash pickup flow: goes straight to kitchen; collection requires cash recorded and food ready', async () => {
  const kitchen = await makeUser(['kitchen']);
  const cashier = await makeUser(['support']);
  const r = await createOrder(orderInput(fx, { paymentMethod: 'cash' }), { user: null, ip: '5.5.5.5' });
  let o = await orderRow(r.orderId);
  assert.equal(o.status, 'placed');
  assert.equal(o.paymentStatus, 'cash_due');
  assert.equal(o.kitchenStatus, 'new');

  await kitchenAction(kitchen, r.orderId, 'accept');
  await kitchenAction(kitchen, r.orderId, 'start');
  await assert.rejects(markPickupCollected(cashier, r.orderId), /not marked this order ready/);
  await kitchenAction(kitchen, r.orderId, 'ready');
  o = await orderRow(r.orderId);
  assert.equal(o.fulfillmentStatus, 'ready_for_pickup');
  await assert.rejects(markPickupCollected(cashier, r.orderId), /Record the cash payment/);
  await assert.rejects(recordCashCollected(cashier, r.orderId, 100), /must equal/);
  await recordCashCollected(cashier, r.orderId, o.totalPesewas);
  await markPickupCollected(cashier, r.orderId);
  o = await orderRow(r.orderId);
  assert.equal(o.status, 'completed');
  assert.equal(o.kitchenStatus, 'handed_off');
  assert.equal(o.fulfillmentStatus, 'collected');
  const view = await trackingView(r.trackingToken);
  assert.equal(view.stage, 'completed');
  const notes = view.notifications.map((n) => n.title);
  assert.ok(notes.includes('Ready for pickup'));
  assert.ok(notes.includes('Order collected'));
});

test('kitchen transitions are validated and concurrent conflicting actions do not corrupt state', async () => {
  const k1 = await makeUser(['kitchen'], 'Cook 1');
  const k2 = await makeUser(['kitchen'], 'Cook 2');
  const r = await createOrder(orderInput(fx, { paymentMethod: 'cash' }), { user: null, ip: '6.6.6.6' });
  await assert.rejects(kitchenAction(k1, r.orderId, 'ready'), /cannot change/);
  const results = await Promise.allSettled([kitchenAction(k1, r.orderId, 'start'), kitchenAction(k2, r.orderId, 'start')]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  assert.match((results.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason.message, /already marked/);
  const events = await sql`select 1 from order_events where order_id = ${r.orderId} and type = 'kitchen.preparing'`;
  assert.equal(events.length, 1);
});

test('customer can cancel before preparation; slot released; not after kitchen starts', async () => {
  const kitchen = await makeUser(['kitchen']);
  const a = await createOrder(orderInput(fx, { paymentMethod: 'cash' }), { user: null, ip: '7.7.7.1' });
  await customerCancelByToken(a.trackingToken, 'Changed my mind', '7.7.7.1');
  let o = await orderRow(a.orderId);
  assert.equal(o.status, 'cancelled');
  const [res] = await sql<{ releasedAt: Date | null }[]>`select released_at from slot_reservations where order_id = ${a.orderId}`;
  assert.ok(res.releasedAt);

  const b = await createOrder(orderInput(fx, { paymentMethod: 'cash' }), { user: null, ip: '7.7.7.2' });
  await kitchenAction(kitchen, b.orderId, 'start');
  await assert.rejects(customerCancelByToken(b.trackingToken, 'too late', '7.7.7.2'), /can no longer be cancelled/);
  o = await orderRow(b.orderId);
  assert.equal(o.status, 'in_progress');
});

test('ordering can be paused; disabled payment methods rejected', async () => {
  await updateSettings('ordering', { cashOnDeliveryEnabled: false }, null);
  await assert.rejects(
    createOrder(orderInput(fx, { paymentMethod: 'cash', fulfillment: { type: 'delivery', addressLine: 'x street', lat: RESTAURANT.lat, lng: RESTAURANT.lng } }), { user: null, ip: '8.8.8.1' }),
    /Cash payment is not available for delivery/,
  );
  await updateSettings('ordering', { acceptingOrders: false, pauseMessage: 'Closed for a private event' }, null);
  await assert.rejects(createOrder(orderInput(fx), { user: null, ip: '8.8.8.2' }), /private event/);
});

test('staff cancel requires permission and records audit', async () => {
  const kitchen = await makeUser(['kitchen']);
  const r = await createOrder(orderInput(fx, { paymentMethod: 'cash' }), { user: null, ip: '9.9.9.9' });
  const { staffCancelOrder } = await import('@/server/orders/lifecycle');
  await assert.rejects(staffCancelOrder(kitchen, r.orderId, 'no'), /permission/);
  const mgr = await makeUser(['manager']);
  await staffCancelOrder(mgr, r.orderId, 'Out of rice');
  const a = await sql`select * from audit_events where action = 'order.cancelled' and entity_id = ${r.orderId}`;
  assert.equal(a.length, 1);
  void cancelOrder;
});
