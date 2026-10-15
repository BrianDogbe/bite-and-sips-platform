import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.APP_SECRET ??= 'unit-secret-unit-secret-unit-secret-0123456789';
process.env.DATABASE_URL ??= 'postgres://unused';
import { candidateSlots, computeSlots, isOpenAt, intervalsForLocalDay } from '@/server/scheduling';
import { resolveZone, haversineM, deliveryFeeFor } from '@/server/zones';
import { evaluatePromotion } from '@/server/pricing';
import { signTicket, verifyTicket } from '@/server/realtime-auth';
import { detectPortal } from '@/server/portal';
import { zonedToUtc, localParts } from '@/lib/time';
import { percentOf, parseCedisToPesewas, pesewasToCedisString } from '@/lib/money';
import { canTransition, KITCHEN_TRANSITIONS, DELIVERY_TRANSITIONS, customerStage } from '@/lib/states';
import { can, canGrantRole, permissionsFor } from '@/server/auth/permissions';

const settings = { slotMinutes: 15, slotCapacity: 2, minLeadMinutes: 20, maxDaysAhead: 1, lastOrderBeforeCloseMinutes: 15 };
const hours = [1, 2, 3, 4, 5, 6, 0].map((weekday, id) => ({ id, weekday, opensAt: '10:00', closesAt: '21:00' }));

test('timezone conversion: Accra is UTC+0; other zones round-trip', () => {
  assert.equal(zonedToUtc(2026, 10, 12, 10, 0, 'Africa/Accra').toISOString(), '2026-10-12T10:00:00.000Z');
  const lagos = zonedToUtc(2026, 10, 12, 10, 0, 'Africa/Lagos');
  assert.equal(lagos.toISOString(), '2026-10-12T09:00:00.000Z');
  assert.equal(localParts(lagos, 'Africa/Lagos').hour, 10);
});

test('slots respect lead time, prep time, closing cutoff and step', () => {
  const now = new Date('2026-10-12T09:50:00Z'); // Monday, before opening
  const s = candidateSlots({ now, tz: 'Africa/Accra', kind: 'pickup', prepMinutes: 0, settings, data: { hours, closures: [] } });
  assert.equal(s[0].toISOString(), '2026-10-12T10:30:00.000Z'); // open 10:00 + 20 lead → 10:30 (step)
  const today = s.filter((d) => d.toISOString().startsWith('2026-10-12'));
  assert.equal(today[today.length - 1].toISOString(), '2026-10-12T20:45:00.000Z'); // 21:00 − 15
  const longPrep = candidateSlots({ now: new Date('2026-10-12T12:02:00Z'), tz: 'Africa/Accra', kind: 'pickup', prepMinutes: 45, settings, data: { hours, closures: [] } });
  assert.equal(longPrep[0].toISOString(), '2026-10-12T13:00:00.000Z'); // 12:02 + 45 → 12:47 → 13:00
});

test('closures remove slots for the matching scope only', () => {
  const now = new Date('2026-10-12T09:00:00Z');
  const closures = [{ id: 1, startsAt: new Date('2026-10-12T12:00:00Z'), endsAt: new Date('2026-10-12T14:00:00Z'), scope: 'delivery' as const, reason: 'x' }];
  const d = candidateSlots({ now, tz: 'Africa/Accra', kind: 'delivery', prepMinutes: 0, settings, data: { hours, closures } });
  const p = candidateSlots({ now, tz: 'Africa/Accra', kind: 'pickup', prepMinutes: 0, settings, data: { hours, closures } });
  assert.ok(!d.some((x) => x.toISOString() === '2026-10-12T13:00:00.000Z'));
  assert.ok(p.some((x) => x.toISOString() === '2026-10-12T13:00:00.000Z'));
  assert.equal(isOpenAt(new Date('2026-10-12T13:00:00Z'), 'Africa/Accra', { hours, closures }, 'delivery'), false);
  assert.equal(isOpenAt(new Date('2026-10-12T22:00:00Z'), 'Africa/Accra', { hours, closures: [] }, 'pickup'), false);
});

test('slot capacity marks full slots unavailable', () => {
  const now = new Date('2026-10-12T09:00:00Z');
  const usage = new Map([['2026-10-12T10:30:00.000Z', 2]]);
  const slots = computeSlots({ now, tz: 'Africa/Accra', kind: 'pickup', prepMinutes: 0, settings, data: { hours, closures: [] }, usage });
  assert.equal(slots.find((s) => s.start === '2026-10-12T10:30:00.000Z')?.available, false);
  assert.equal(slots.find((s) => s.start === '2026-10-12T10:45:00.000Z')?.remaining, 2);
});

test('no hours → no slots; split shifts supported', () => {
  assert.equal(candidateSlots({ now: new Date(), tz: 'Africa/Accra', kind: 'pickup', prepMinutes: 0, settings, data: { hours: [], closures: [] } }).length, 0);
  const split = [{ id: 1, weekday: 1, opensAt: '11:00', closesAt: '14:00' }, { id: 2, weekday: 1, opensAt: '17:00', closesAt: '21:00' }];
  assert.equal(intervalsForLocalDay(new Date('2026-10-12T08:00:00Z'), 'Africa/Accra', split).length, 2);
});

test('zones: smallest containing zone wins; outside rejected; manual unverified', () => {
  const z = (id: number, r: number, fee: number) => ({ id, name: `Z${id}`, description: null, centerLat: 5.6, centerLng: -0.18, radiusM: r, feePesewas: fee, perKmPesewas: 0, maxFeePesewas: null, minOrderPesewas: 0, etaMinMinutes: null, etaMaxMinutes: null, isActive: true, sortOrder: 0, isDemo: false });
  const zones = [z(1, 8000, 2000), z(2, 3000, 1000)];
  const near = resolveZone(zones, { lat: 5.61, lng: -0.18 }, true);
  assert.ok(near.ok && near.zone.id === 2 && near.verified);
  assert.deepEqual(resolveZone(zones, { lat: 5.9, lng: -0.18 }, true), { ok: false, reason: 'outside_area' });
  const man = resolveZone(zones, { zoneId: 1 }, true);
  assert.ok(man.ok && !man.verified);
  assert.deepEqual(resolveZone(zones, { zoneId: 1 }, false), { ok: false, reason: 'manual_zone_disabled' });
  assert.ok(Math.abs(haversineM(5.6, -0.18, 5.61, -0.18) - 1112) < 5);
});

test('delivery fee: flat when no per-km rate; otherwise base + per-km × distance, rounded up to 50p and capped', () => {
  const flat = { feePesewas: 1500, perKmPesewas: 0, maxFeePesewas: null };
  assert.equal(deliveryFeeFor(flat, 0), 1500);
  assert.equal(deliveryFeeFor(flat, 9000), 1500);
  const z = { feePesewas: 800, perKmPesewas: 200, maxFeePesewas: 4000 };
  assert.equal(deliveryFeeFor(z, 0), 800);
  assert.equal(deliveryFeeFor(z, 1000), 1000);
  assert.equal(deliveryFeeFor(z, 3000), 1400);
  assert.equal(deliveryFeeFor(z, 3100), 1450); // 800 + 620 = 1420 → 1450
  assert.equal(deliveryFeeFor(z, 50_000), 4000); // capped
  assert.equal(deliveryFeeFor({ ...z, maxFeePesewas: null }, 50_000), 10_800);
  const zones = [{ id: 1, name: 'T', description: null, centerLat: 5.6, centerLng: -0.18, radiusM: 8000, ...z, minOrderPesewas: 0, etaMinMinutes: null, etaMaxMinutes: null, isActive: true, sortOrder: 0, isDemo: false }];
  // distance is measured from the restaurant origin, not the zone centre
  const gps = resolveZone(zones, { lat: 5.63, lng: -0.18 }, true, { lat: 5.6, lng: -0.18 });
  assert.ok(gps.ok && gps.verified && !gps.feeEstimated && Math.abs(gps.feeDistanceM - 3336) < 10);
  const noOrigin = resolveZone(zones, { lat: 5.63, lng: -0.18 }, true, { lat: null, lng: null });
  assert.ok(noOrigin.ok && Math.abs(noOrigin.feeDistanceM - 3336) < 10);
  const man = resolveZone(zones, { zoneId: 1 }, true);
  assert.ok(man.ok && man.feeEstimated && man.feeDistanceM === 4000);
});

test('money: exact parsing and rounding', () => {
  assert.equal(parseCedisToPesewas('12.5'), 1250);
  assert.equal(parseCedisToPesewas('1,200.05'), 120005);
  assert.equal(parseCedisToPesewas('12.345'), null);
  assert.equal(parseCedisToPesewas('-1'), null);
  assert.equal(pesewasToCedisString(5), '0.05');
  assert.equal(percentOf(1230, 1500), 185);
  assert.equal(percentOf(1000, 0), 0);
});

test('promotions: windows, limits, minimums, caps', () => {
  const base = { id: 1, code: 'X', description: null, discountType: 'percent' as const, discountValue: 10, minSubtotalPesewas: 0, maxDiscountPesewas: null, startsAt: null, endsAt: null, usageLimit: null, usedCount: 0, isActive: true };
  const now = new Date('2026-10-12T10:00:00Z');
  assert.equal(evaluatePromotion(base, 5000, now).discount, 500);
  assert.equal(evaluatePromotion({ ...base, maxDiscountPesewas: 300 }, 5000, now).discount, 300);
  assert.match(evaluatePromotion({ ...base, endsAt: new Date('2026-10-01') }, 5000, now).error!, /expired/);
  assert.match(evaluatePromotion({ ...base, usageLimit: 3, usedCount: 3 }, 5000, now).error!, /fully redeemed/);
  assert.match(evaluatePromotion({ ...base, minSubtotalPesewas: 6000 }, 5000, now).error!, /minimum/);
  assert.equal(evaluatePromotion({ ...base, discountType: 'fixed', discountValue: 9000 }, 5000, now).discount, 5000);
});

test('state machines reject illegal transitions', () => {
  assert.equal(canTransition(KITCHEN_TRANSITIONS, 'new', 'ready'), false);
  assert.equal(canTransition(KITCHEN_TRANSITIONS, 'preparing', 'ready'), true);
  assert.equal(canTransition(KITCHEN_TRANSITIONS, 'handed_off', 'preparing'), false);
  assert.equal(canTransition(DELIVERY_TRANSITIONS, 'unassigned', 'delivered'), false);
  assert.equal(canTransition(DELIVERY_TRANSITIONS, 'delivered', 'failed'), false);
  assert.equal(customerStage({ status: 'placed', paymentStatus: 'paid', kitchenStatus: 'ready', fulfillmentType: 'delivery', fulfillmentStatus: 'unassigned' }), 'waiting_for_rider');
  assert.equal(customerStage({ status: 'pending_payment', paymentStatus: 'pending', kitchenStatus: 'not_sent', fulfillmentType: 'pickup', fulfillmentStatus: 'pending' }), 'awaiting_payment');
});

test('permission matrix: least privilege', () => {
  assert.equal(can(['kitchen'], 'finance.view'), false);
  assert.equal(can(['kitchen'], 'customers.view'), false);
  assert.equal(can(['rider'], 'settings.manage'), false);
  assert.equal(can(['kitchen'], 'payments.refund'), false);
  assert.equal(can(['rider'], 'orders.view'), false);
  assert.equal(can(['rider'], 'payments.refund'), false);
  assert.equal(can(['manager'], 'payments.refund'), false);
  assert.equal(can(['manager'], 'audit.view'), false);
  assert.equal(can(['manager'], 'settings.money'), false);
  assert.equal(can(['manager'], 'finance.manage'), false);
  assert.equal(can(['manager'], 'finance.view'), true);
  assert.equal(can(['manager'], 'settings.manage'), true);
  assert.equal(can(['owner'], 'payments.refund'), true);
  assert.equal(can(['owner'], 'audit.view'), true);
  assert.equal(canGrantRole(['manager'], 'owner'), false);
  assert.equal(canGrantRole(['owner'], 'owner'), true);
  assert.equal(permissionsFor(['customer']).size, 0);
});

test('realtime tickets: signed, tamper-proof and short-lived', () => {
  const t = signTicket(['menu', 'kitchen'], 1_000);
  assert.deepEqual(verifyTicket(t, 2_000), ['menu', 'kitchen']);
  assert.equal(verifyTicket(t, 1_000 + 6 * 60 * 1000), null); // expired
  const [p, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ t: ['menu', 'admin'], exp: 9e15 })).toString('base64url');
  assert.equal(verifyTicket(`${forged}.${sig}`, 2_000), null);
  assert.equal(verifyTicket(`${p}.x${sig}`, 2_000), null);
  assert.equal(verifyTicket('garbage', 2_000), null);
  assert.equal(verifyTicket(undefined, 2_000), null);
});

test('portal detection: by path, by referer for shared endpoints, never by client claim', () => {
  const base = { host: 'localhost', publicHost: 'localhost:3001', hosts: {} };
  assert.equal(detectPortal({ ...base, path: '/api/kitchen/queue', referer: null }), 'kitchen');
  assert.equal(detectPortal({ ...base, path: '/api/rider/state', referer: null }), 'rider');
  assert.equal(detectPortal({ ...base, path: '/api/dispatch/board', referer: null }), 'admin');
  assert.equal(detectPortal({ ...base, path: '/api/realtime', referer: 'http://localhost:3001/admin/orders' }), 'admin');
  assert.equal(detectPortal({ ...base, path: '/api/realtime', referer: 'http://evil.example/admin' }), 'customer');
  assert.equal(detectPortal({ ...base, path: '/api/menu', referer: null }), 'customer');
  assert.equal(detectPortal({ host: 'rider.example.com', publicHost: 'rider.example.com', path: '/', referer: null, hosts: { rider: 'rider.example.com' } }), 'rider');
});
