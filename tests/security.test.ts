import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resetDb, done, seedFixture, orderInput, makeUser, type Fixture } from './helpers';
import { sql } from '@/server/db';
import { createOrder } from '@/server/orders/create';
import { login, getSessionUser, revokeSession } from '@/server/auth/sessions';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { trackingView, lookupGuestOrder, listOrders, orderDetail, kitchenQueue, reorderLines } from '@/server/orders/queries';
import { kitchenAction } from '@/server/orders/lifecycle';
import { assignRider, riderAssignments } from '@/server/fulfillment/inhouse';
import { financeSummary, addExpense, removeExpense, listExpenses } from '@/server/reporting';
import { requestRefund } from '@/server/payments/service';
import { setStaffRoles, createStaff } from '@/server/staff';
import { saveItem } from '@/server/menu-admin';
import { updateSettings } from '@/server/settings';
import { hitRateLimit } from '@/server/auth/rate-limit';
import { RESTAURANT } from './helpers';

let fx: Fixture;
after(done);
beforeEach(async () => {
  await resetDb();
  fx = await seedFixture();
});

test('passwords are hashed with scrypt and verified in constant time', async () => {
  const h = await hashPassword('correct horse battery');
  assert.match(h, /^scrypt\$/);
  assert.equal(await verifyPassword('correct horse battery', h), true);
  assert.equal(await verifyPassword('wrong', h), false);
  assert.equal(await verifyPassword('x', null), false);
});

test('login: wrong password generic error, lockout after repeated failures, wrong portal refused, session revocation', async () => {
  const u = await makeUser(['kitchen']);
  await assert.rejects(login(u.email!, 'nope-nope-nope', { ip: '1' }), /Incorrect email\/phone or password/);
  await assert.rejects(login('nobody@x.test', 'nope-nope-nope', { ip: '1' }), /Incorrect email\/phone or password/);
  await assert.rejects(login(u.email!, 'correct horse battery', { ip: '1', requireAnyRole: ['rider'] }), /does not have access/);
  const ok = await login(u.email!, 'correct horse battery', { ip: '1' });
  assert.ok(await getSessionUser(ok.token));
  await revokeSession(ok.token);
  assert.equal(await getSessionUser(ok.token), null);
  for (let i = 0; i < 8; i++) await login(u.email!, `bad-${i}-xxxxxx`, { ip: `ip${i}` }).catch(() => {});
  await assert.rejects(login(u.email!, 'correct horse battery', { ip: '9' }), /locked|Too many/);
});

test('rate limiter blocks after the limit within the window', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await hitRateLimit('t:1', 3, 60)).allowed, true);
  assert.equal((await hitRateLimit('t:1', 3, 60)).allowed, false);
});

test('customers cannot access other orders: tokens are unguessable; lookup needs matching phone', async () => {
  const a = await createOrder(orderInput(fx, { paymentMethod: 'cash' }), { user: null, ip: 's1' });
  await assert.rejects(trackingView('A'.repeat(43)), /not found/);
  await assert.rejects(trackingView(a.orderId), /not found/); // order id is not a tracking credential
  await assert.rejects(lookupGuestOrder(a.orderNumber, '0200000000', 's1'), /not found/);
  assert.equal(await lookupGuestOrder(a.orderNumber, '024 123 4567', 's1'), a.trackingToken);
  const cust = await makeUser(['customer']);
  await assert.rejects(reorderLines(cust, a.orderId), /permission/);
  const view = await trackingView(a.trackingToken);
  assert.equal(JSON.stringify(view).includes('customerPhone'), false, 'tracking payload must not echo phone');
});

test('staff endpoints enforce permissions on the server', async () => {
  const kitchen = await makeUser(['kitchen']);
  const rider = await makeUser(['rider']);
  const other = await makeUser(['rider']);
  const manager = await makeUser(['manager']);
  const r = await createOrder(orderInput(fx, { paymentMethod: 'cash' }), { user: null, ip: 's2' });
  await assert.rejects(financeSummary(kitchen, new Date(0), new Date()), /permission/);
  await assert.rejects(financeSummary(other, new Date(0), new Date()), /permission/);
  await assert.rejects(listOrders(kitchen, {}), /permission/);
  await assert.rejects(listOrders(null, {}), /sign in/);
  await assert.rejects(kitchenAction(other, r.orderId, 'start'), /permission/);
  await assert.rejects(kitchenAction(rider, r.orderId, 'start'), /permission/);
  await assert.rejects(requestRefund(other, { orderId: r.orderId, amountPesewas: 1, reason: 'x', idempotencyKey: 'abcabcabc1' }), /permission/);
  await assert.rejects(saveItem(kitchen, {}), /permission/);
  await assert.rejects(createStaff(other, { fullName: 'x', email: 'x@x.co', roles: ['owner'], password: 'long-enough-pw' }), /permission/);
  await assert.rejects(createStaff(manager, { fullName: 'x', email: 'x@x.co', roles: ['owner'], password: 'long-enough-pw' }), /cannot grant the owner/);
  await assert.rejects(assignRider(other, { orderId: r.orderId, riderUserId: rider.id }), /permission/);
  const q = await kitchenQueue(kitchen);
  assert.equal(JSON.stringify(q).includes('customerPhone'), false, 'kitchen must not receive phone numbers');
  assert.equal(JSON.stringify(q).includes('totalPesewas'), false, 'kitchen must not receive totals');
  void manager;
});

test('riders only see their own assignments, and no address before accepting', async () => {
  const dispatcher = await makeUser(['manager']);
  const r1 = await makeUser(['rider']);
  const r2 = await makeUser(['rider']);
  const o = await createOrder(orderInput(fx, { paymentMethod: 'cash', fulfillment: { type: 'delivery', addressLine: 'Secret St', lat: RESTAURANT.lat, lng: RESTAURANT.lng } }), { user: null, ip: 's3' });
  await assignRider(dispatcher, { orderId: o.orderId, riderUserId: r1.id });
  assert.equal((await riderAssignments(r2)).assignments.length, 0);
  const mine = await riderAssignments(r1);
  assert.equal(mine.assignments[0].addressLine, null);
  assert.equal(mine.assignments[0].customerPhone, null);
});

test('removing a role revokes that user’s sessions; the last owner cannot be removed', async () => {
  const owner = await makeUser(['owner']);
  const m = await makeUser(['manager']);
  const s = await login(m.email!, 'correct horse battery', { ip: 'x' });
  await setStaffRoles(owner, m.id, ['kitchen']);
  assert.equal(await getSessionUser(s.token), null);
  await assert.rejects(setStaffRoles(owner, owner.id, ['manager']), /at least one active owner|own roles/);
});

test('audit trail records financial and staff actions', async () => {
  const owner = await makeUser(['owner']);
  await createStaff(owner, { fullName: 'New Cook', email: 'cook@x.co', roles: ['kitchen'], password: 'long-enough-pw' });
  const rows = await sql`select action from audit_events where action = 'staff.created'`;
  assert.equal(rows.length, 1);
});

test('settings validation rejects invalid values', async () => {
  await assert.rejects(updateSettings('ordering', { slotCapacity: 0 } as never, null));
  await assert.rejects(updateSettings('ordering', { taxBps: 99999 } as never, null));
});

test('no server secrets referenced from client-side code', () => {
  const clientFiles: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|js)$/.test(f)) {
        const src = readFileSync(p, 'utf8');
        if (/^['"]use client['"]/.test(src.trimStart())) clientFiles.push(p);
      }
    }
  };
  walk(join(process.cwd(), 'src'));
  assert.ok(clientFiles.length > 10);
  for (const f of clientFiles) {
    const src = readFileSync(f, 'utf8');
    assert.equal(/PAYSTACK_SECRET|APP_SECRET|DATABASE_URL|CRON_SECRET|RESEND_API_KEY|HUBTEL_SMS_CLIENT_SECRET/.test(src), false, `${f} references a secret`);
    for (const m of src.matchAll(/^import\s+(?!type\b)[^'"]*from\s+['"](@\/server\/[^'"]+)['"]/gm)) assert.fail(`${f} imports server module ${m[1]} at runtime`);
  }
});

test('expenses: only the owner can record or remove them, and removal is audited', async () => {
  const owner = await makeUser(['owner']);
  const manager = await makeUser(['manager']);
  const day = new Date().toISOString().slice(0, 10);
  await assert.rejects(addExpense(manager, { incurredOn: day, category: 'Gas', amountPesewas: 5000 }), /permission/);
  await addExpense(owner, { incurredOn: day, category: 'Gas', amountPesewas: 5000 });
  const from = new Date(Date.now() - 2 * 86400000);
  const to = new Date(Date.now() + 2 * 86400000);
  const [e] = await listExpenses(owner, from, to);
  assert.ok(e);
  await assert.rejects(removeExpense(manager, e.id), /permission/);
  await removeExpense(owner, e.id);
  assert.equal((await listExpenses(owner, from, to)).length, 0);
  const [a] = await sql<{ n: number }[]>`select count(*)::int as n from audit_events where action = 'finance.expense_removed'`;
  assert.equal(a.n, 1);
  await assert.rejects(removeExpense(owner, e.id), /not found/);
});
