import 'server-only';
import { cache } from 'react';
import { getAllSettings } from './settings';
import { publicMenu, bestsellerIds } from './menu';
import { loadSchedule, hoursSummary, availableSlots } from './scheduling';
import { activePaymentProvider } from './payments/provider';
import { listZones } from './zones';
import { sql } from './db';

/** Public, customer-safe storefront data (no secrets, no internal config). */
export const getStorefront = cache(async () => {
  const s = await getAllSettings();
  const r = s.restaurant;
  const schedule = await loadSchedule();
  const summary = hoursSummary(schedule, r.timezone);
  const [{ demo }] = await sql<{ demo: boolean }[]>`select exists(select 1 from menu_items where is_demo and not is_archived) as demo`;
  const provider = activePaymentProvider();
  return {
    restaurant: {
      isConfigured: r.isConfigured,
      name: r.name,
      tagline: r.tagline,
      about: r.about,
      phone: r.phone,
      whatsapp: r.whatsapp,
      email: r.email,
      addressLine: r.addressLine,
      city: r.city,
      lat: r.lat,
      lng: r.lng,
      timezone: r.timezone,
      pickupInstructions: r.pickupInstructions,
      social: { instagram: r.instagram, facebook: r.facebook, tiktok: r.tiktok, x: r.x },
    },
    ordering: {
      acceptingOrders: s.ordering.acceptingOrders,
      pauseMessage: s.ordering.pauseMessage,
      pickupEnabled: s.ordering.pickupEnabled,
      deliveryEnabled: s.ordering.deliveryEnabled,
      onlinePayments: s.ordering.onlinePaymentsEnabled && !!provider,
      testPayments: provider === 'mock',
      cashOnPickup: s.ordering.cashOnPickupEnabled,
      cashOnDelivery: s.ordering.cashOnDeliveryEnabled,
      cancellationPolicy: s.ordering.cancellationPolicy,
      refundPolicy: s.ordering.refundPolicy,
      taxLabel: s.ordering.taxLabel,
      serviceChargeBps: s.ordering.serviceChargeBps,
      taxBps: s.ordering.taxBps,
      minOrderPesewas: s.ordering.minOrderPesewas,
      maxItemQuantity: s.ordering.maxItemQuantity,
      allowManualZone: s.delivery.allowManualZoneSelection,
    },
    hours: schedule.hours,
    closures: schedule.closures
      .filter((c) => new Date(c.endsAt) > new Date())
      .map((c) => ({ startsAt: c.startsAt, endsAt: c.endsAt, scope: c.scope, reason: c.reason })),
    openNow: summary.openNow,
    hasHours: summary.hasHours,
    demoMenu: demo,
  };
});

export type Storefront = Awaited<ReturnType<typeof getStorefront>>;

export async function getMenuForStorefront() {
  const [menu, best] = await Promise.all([publicMenu(), bestsellerIds()]);
  return { ...menu, bestsellerIds: best };
}

export async function earliestSlot(kind: 'pickup' | 'delivery') {
  const s = await getAllSettings();
  const slots = await availableSlots({ tz: s.restaurant.timezone, kind, prepMinutes: 0, settings: s.ordering });
  return slots.find((x) => x.available)?.start ?? null;
}

export async function publicZones() {
  const zones = await listZones({ activeOnly: true });
  return zones.map((z) => ({
    id: z.id,
    name: z.name,
    description: z.description,
    feePesewas: z.feePesewas,
    perKmPesewas: z.perKmPesewas,
    maxFeePesewas: z.maxFeePesewas,
    radiusM: z.radiusM,
    minOrderPesewas: z.minOrderPesewas,
    etaMinMinutes: z.etaMinMinutes,
    etaMaxMinutes: z.etaMaxMinutes,
  }));
}
