/**
 * Integration-test helpers. Tests run against a REAL PostgreSQL database
 * (TEST_DATABASE_URL, default postgres://postgres@127.0.0.1:5432/biteandsips_test).
 * The database is migrated and truncated by these helpers — never point it at real data.
 */
// Next's types declare NODE_ENV read-only, so assign through a loose view of process.env.
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres@127.0.0.1:5432/biteandsips_test';
process.env.DATABASE_SSL = 'disable';
process.env.APP_SECRET = process.env.APP_SECRET || 'test-secret-test-secret-test-secret-0123456789';
process.env.APP_URL = 'http://localhost:3000';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.SCRYPT_COST = '10';
process.env.NOTIFY_SMS_PROVIDER = 'log';
process.env.NOTIFY_EMAIL_PROVIDER = 'log';
process.env.DELIVERY_SANDBOX_PROVIDER = 'true';

import { randomUUID } from 'node:crypto';
import { migrate } from '../scripts/migrate';
import { sql, closeSql } from '@/server/db';
import { hashPassword } from '@/server/auth/password';
import { permissionsFor, type Role } from '@/server/auth/permissions';
import type { SessionUser } from '@/server/auth/sessions';
import { updateSettings } from '@/server/settings';
import { signMockWebhook } from '@/server/payments/mock';
import { handlePaymentWebhook } from '@/server/payments/service';

let migrated = false;

export async function resetDb() {
  if (!migrated) {
    await migrate(process.env.DATABASE_URL!, { quiet: true });
    migrated = true;
  }
  const tables = await sql<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'`;
  await sql.unsafe(`truncate ${tables.map((t) => `"${t.tablename}"`).join(', ')} restart identity cascade`);
}

export async function done() {
  await closeSql();
}

export async function makeUser(roles: Role[], name = `User ${roles.join('+')}`): Promise<SessionUser> {
  const email = `${roles.join('-')}-${randomUUID().slice(0, 8)}@test.local`;
  const [u] = await sql<{ id: string }[]>`
    insert into users (email, phone, full_name, password_hash) values (${email}, ${'+23320' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}, ${name}, ${await hashPassword('correct horse battery')})
    returning id`;
  for (const r of roles) await sql`insert into user_roles (user_id, role) values (${u.id}, ${r})`;
  if (roles.includes('rider')) await sql`insert into rider_profiles (user_id, is_on_duty, last_heartbeat_at) values (${u.id}, true, now())`;
  return { id: u.id, sessionId: 'test', fullName: name, email, phone: null, roles, permissions: permissionsFor(roles) };
}

export interface Fixture {
  categoryId: number;
  jollofId: number; // variants (Regular/Large) + required protein (exactly 1) + optional extras (up to 2)
  jollofRegular: number;
  jollofLarge: number;
  chicken: number;
  fish: number;
  extraPlantain: number;
  extraEgg: number;
  soldOutProtein: number;
  drinkId: number; // simple item
  soldOutId: number;
  zoneInner: number;
  zoneOuter: number;
}

export const RESTAURANT = { lat: 5.6037, lng: -0.187 }; // central Accra (test fixture only)

export async function seedFixture(opts: { slotCapacity?: number; cash?: boolean; autoAccept?: boolean } = {}): Promise<Fixture> {
  await updateSettings('restaurant', { isConfigured: true, name: 'Test Kitchen', timezone: 'Africa/Accra', lat: RESTAURANT.lat, lng: RESTAURANT.lng, phone: '+233200000000' }, null);
  await updateSettings(
    'ordering',
    {
      slotCapacity: opts.slotCapacity ?? 10,
      slotMinutes: 15,
      minLeadMinutes: 15,
      maxDaysAhead: 2,
      cashOnPickupEnabled: opts.cash ?? true,
      cashOnDeliveryEnabled: opts.cash ?? true,
      autoAcceptOrders: opts.autoAccept ?? false,
      paymentWindowMinutes: 20,
    },
    null,
  );
  for (let d = 0; d < 7; d++) await sql`insert into operating_hours (weekday, opens_at, closes_at) values (${d}, '00:00', '23:59')`;
  const [cat] = await sql<{ id: number }[]>`insert into menu_categories (name, slug, sort_order) values ('Mains', 'mains', 1) returning id`;
  const [jollof] = await sql<{ id: number }[]>`
    insert into menu_items (category_id, name, slug, description, base_price_pesewas, prep_minutes, allergens, allergens_verified)
    values (${cat.id}, 'Jollof Rice', 'jollof-rice', 'Test', 5000, 20, '{fish}', true) returning id`;
  const [reg] = await sql<{ id: number }[]>`insert into menu_variants (item_id, name, price_pesewas, is_default, sort_order) values (${jollof.id}, 'Regular', 5000, true, 1) returning id`;
  const [lg] = await sql<{ id: number }[]>`insert into menu_variants (item_id, name, price_pesewas, sort_order) values (${jollof.id}, 'Large', 7000, 2) returning id`;
  const [g1] = await sql<{ id: number }[]>`insert into modifier_groups (item_id, name, min_select, max_select, sort_order) values (${jollof.id}, 'Protein', 1, 1, 1) returning id`;
  const [chicken] = await sql<{ id: number }[]>`insert into modifiers (group_id, name, price_pesewas) values (${g1.id}, 'Chicken', 1500) returning id`;
  const [fish] = await sql<{ id: number }[]>`insert into modifiers (group_id, name, price_pesewas) values (${g1.id}, 'Fish', 2000) returning id`;
  const [soldOutProtein] = await sql<{ id: number }[]>`insert into modifiers (group_id, name, price_pesewas, is_available) values (${g1.id}, 'Goat', 2500, false) returning id`;
  const [g2] = await sql<{ id: number }[]>`insert into modifier_groups (item_id, name, min_select, max_select, sort_order) values (${jollof.id}, 'Extras', 0, 2, 2) returning id`;
  const [plantain] = await sql<{ id: number }[]>`insert into modifiers (group_id, name, price_pesewas) values (${g2.id}, 'Plantain', 800) returning id`;
  const [egg] = await sql<{ id: number }[]>`insert into modifiers (group_id, name, price_pesewas) values (${g2.id}, 'Egg', 500) returning id`;
  const [drink] = await sql<{ id: number }[]>`insert into menu_items (category_id, name, slug, base_price_pesewas, prep_minutes) values (${cat.id}, 'Sobolo', 'sobolo', 1200, 2) returning id`;
  const [soldOut] = await sql<{ id: number }[]>`insert into menu_items (category_id, name, slug, base_price_pesewas, is_available) values (${cat.id}, 'Banku', 'banku', 4000, false) returning id`;
  const [inner] = await sql<{ id: number }[]>`
    insert into delivery_zones (name, center_lat, center_lng, radius_m, fee_pesewas, min_order_pesewas, eta_min_minutes, eta_max_minutes)
    values ('Inner', ${RESTAURANT.lat}, ${RESTAURANT.lng}, 3000, 1000, 0, 20, 35) returning id`;
  const [outer] = await sql<{ id: number }[]>`
    insert into delivery_zones (name, center_lat, center_lng, radius_m, fee_pesewas, min_order_pesewas, eta_min_minutes, eta_max_minutes)
    values ('Outer', ${RESTAURANT.lat}, ${RESTAURANT.lng}, 8000, 2000, 6000, 30, 50) returning id`;
  return {
    categoryId: cat.id,
    jollofId: jollof.id,
    jollofRegular: reg.id,
    jollofLarge: lg.id,
    chicken: chicken.id,
    fish: fish.id,
    extraPlantain: plantain.id,
    extraEgg: egg.id,
    soldOutProtein: soldOutProtein.id,
    drinkId: drink.id,
    soldOutId: soldOut.id,
    zoneInner: inner.id,
    zoneOuter: outer.id,
  };
}

export function orderInput(fx: Fixture, over: Record<string, unknown> = {}) {
  return {
    idempotencyKey: `test_${randomUUID().replace(/-/g, '')}`,
    items: [
      { menuItemId: fx.jollofId, variantId: fx.jollofLarge, modifierIds: [fx.chicken, fx.extraPlantain], quantity: 2, instructions: 'Less pepper' },
      { menuItemId: fx.drinkId, modifierIds: [], quantity: 1 },
    ],
    contact: { name: 'Ama Mensah', phone: '0241234567', email: 'ama@example.com' },
    fulfillment: { type: 'pickup', slot: null },
    paymentMethod: 'online',
    acceptTerms: true,
    ...over,
  };
}

/** Simulate the customer completing (or failing) payment on the mock hosted checkout, then deliver the signed webhook. */
export async function mockPay(reference: string, outcome: 'success' | 'failed' = 'success', eventId: string = randomUUID()) {
  await sql`update mock_transactions set status = ${outcome}, updated_at = now() where reference = ${reference}`;
  const body = JSON.stringify({ event: outcome === 'success' ? 'charge.success' : 'charge.failed', id: eventId, data: { reference } });
  const headers = new Headers({ 'x-mock-signature': signMockWebhook(body) });
  return { result: await handlePaymentWebhook('mock', body, headers), body, headers };
}

export async function latestAttempt(orderId: string) {
  const [a] = await sql<{ reference: string; status: string; amountPesewas: number }[]>`
    select reference, status, amount_pesewas from payment_attempts where order_id = ${orderId} order by created_at desc limit 1`;
  return a;
}

export async function orderRow(orderId: string) {
  const [o] = await sql<Record<string, any>[]>`select o.*, f.status as fulfillment_status, f.method from orders o join fulfillments f on f.order_id = o.id where o.id = ${orderId}`;
  return o;
}
