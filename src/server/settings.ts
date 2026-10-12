import 'server-only';
import { z } from 'zod';
import { sql, type Db } from './db';

/**
 * Typed business settings stored in the `settings` table (one JSON document per key).
 * Defaults are deliberately conservative placeholders: the owner must supply the real
 * restaurant details, prices, charges and policies (see docs/OWNER-CHECKLIST.md).
 */

export const restaurantSchema = z.object({
  /** false until the owner has entered real details — the site shows a "setup" banner. */
  isConfigured: z.boolean().default(false),
  name: z.string().min(1).max(80).default('Bite & Sips'),
  tagline: z.string().max(140).default('Good food. Good mood.'),
  about: z.string().max(2000).default(''),
  phone: z.string().max(30).default('+233 24 469 3556'),
  whatsapp: z.string().max(30).default(''),
  email: z.string().max(120).default(''),
  addressLine: z.string().max(200).default('Tema C7'),
  city: z.string().max(80).default(''),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
  pickupInstructions: z.string().max(500).default('Show your order number at the counter.'),
  timezone: z.string().default('Africa/Accra'),
  instagram: z.string().max(200).default(''),
  facebook: z.string().max(200).default(''),
  tiktok: z.string().max(200).default(''),
  x: z.string().max(200).default(''),
});

export const orderingSchema = z.object({
  acceptingOrders: z.boolean().default(true),
  pauseMessage: z.string().max(200).default('We are not taking online orders right now.'),
  pickupEnabled: z.boolean().default(true),
  deliveryEnabled: z.boolean().default(true),
  /** If false, new paid orders wait in "New" until kitchen staff accept them. */
  autoAcceptOrders: z.boolean().default(false),
  slotMinutes: z.number().int().min(5).max(60).default(15),
  /** Maximum number of orders the kitchen will take per slot. */
  slotCapacity: z.number().int().min(1).max(200).default(6),
  minLeadMinutes: z.number().int().min(0).max(240).default(20),
  maxDaysAhead: z.number().int().min(0).max(14).default(2),
  lastOrderBeforeCloseMinutes: z.number().int().min(0).max(240).default(15),
  /** Unpaid online orders are cancelled (slot released) after this many minutes. */
  paymentWindowMinutes: z.number().int().min(5).max(120).default(20),
  onlinePaymentsEnabled: z.boolean().default(true),
  cashOnPickupEnabled: z.boolean().default(false),
  cashOnDeliveryEnabled: z.boolean().default(false),
  /** Basis points: 100 = 1%. Default 0 — the owner must configure any applicable taxes/levies. */
  serviceChargeBps: z.number().int().min(0).max(3000).default(0),
  taxBps: z.number().int().min(0).max(5000).default(0),
  taxLabel: z.string().max(60).default('Taxes & levies'),
  minOrderPesewas: z.number().int().min(0).default(0),
  maxItemQuantity: z.number().int().min(1).max(50).default(20),
  allowCustomerCancelBeforeKitchen: z.boolean().default(true),
  cancellationPolicy: z
    .string()
    .max(2000)
    .default('You can cancel an order from your tracking page until the kitchen starts preparing it. After that, please contact us.'),
  refundPolicy: z.string().max(2000).default('Approved refunds are returned to the original payment method. Mobile Money and card refunds can take several working days to arrive.'),
});

export const deliverySchema = z.object({
  /** A rider counts as "online" only if their app pinged within this window. */
  riderOnlineWindowSeconds: z.number().int().min(30).max(900).default(120),
  /** Rider location older than this is displayed as stale. */
  locationStaleSeconds: z.number().int().min(30).max(1800).default(120),
  locationIntervalSeconds: z.number().int().min(5).max(300).default(20),
  locationRetentionDays: z.number().int().min(1).max(365).default(30),
  pinMaxAttempts: z.number().int().min(3).max(10).default(5),
  /** Allow delivery orders where the customer picked a zone manually instead of sharing GPS. */
  allowManualZoneSelection: z.boolean().default(true),
  defaultRiderFeePesewas: z.number().int().min(0).default(0),
});

export const inventorySchema = z.object({
  /** Deduct recipe ingredients automatically when the kitchen starts an order. */
  autoDeductOnPrep: z.boolean().default(false),
});

export const notificationSchema = z.object({
  smsEnabled: z.boolean().default(false),
  emailEnabled: z.boolean().default(false),
});

const registry = {
  restaurant: restaurantSchema,
  ordering: orderingSchema,
  delivery: deliverySchema,
  inventory: inventorySchema,
  notifications: notificationSchema,
} as const;

export type SettingsKey = keyof typeof registry;
export type SettingsOf<K extends SettingsKey> = z.infer<(typeof registry)[K]>;
export type RestaurantSettings = SettingsOf<'restaurant'>;
export type OrderingSettings = SettingsOf<'ordering'>;
export type DeliverySettings = SettingsOf<'delivery'>;

export async function getSettings<K extends SettingsKey>(key: K, db: Db = sql): Promise<SettingsOf<K>> {
  const rows = await db<{ value: unknown }[]>`select value from settings where key = ${key}`;
  const raw = rows[0]?.value ?? {};
  const parsed = registry[key].safeParse(raw);
  // If stored data is somehow invalid, fall back to defaults for invalid fields rather than crash ordering.
  if (parsed.success) return parsed.data as SettingsOf<K>;
  return registry[key].parse({}) as SettingsOf<K>;
}

export async function getAllSettings(db: Db = sql) {
  const [restaurant, ordering, delivery, inventory, notifications] = await Promise.all([
    getSettings('restaurant', db),
    getSettings('ordering', db),
    getSettings('delivery', db),
    getSettings('inventory', db),
    getSettings('notifications', db),
  ]);
  return { restaurant, ordering, delivery, inventory, notifications };
}

export async function updateSettings<K extends SettingsKey>(
  key: K,
  patch: Partial<SettingsOf<K>>,
  actorUserId: string | null,
  db: Db = sql,
): Promise<SettingsOf<K>> {
  const current = await getSettings(key, db);
  const next = registry[key].parse({ ...current, ...patch }) as SettingsOf<K>;
  await db`
    insert into settings (key, value, updated_at, updated_by)
    values (${key}, ${db.json(next as never)}, now(), ${actorUserId})
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
  return next;
}

export function settingsSchema<K extends SettingsKey>(key: K) {
  return registry[key];
}
