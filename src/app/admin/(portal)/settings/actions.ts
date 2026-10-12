'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/server/auth/current';
import { runAction, str, bool, int } from '@/server/action';
import { updateSettings } from '@/server/settings';
import { requirePerm, actorOf } from '@/server/auth/guard';
import { audit } from '@/server/audit';
import { sql } from '@/server/db';
import { replaceOperatingHours, addClosure, removeClosure, saveZone } from '@/server/ops';
import { parseCedisToPesewas } from '@/lib/money';
import { invalid } from '@/server/errors';
import { zonedToUtc } from '@/lib/time';
import type { ActionResult } from '@/lib/action-result';

async function guard() {
  return requirePerm(await getCurrentUser(), 'settings.manage');
}
const money = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (!v) return 0;
  const p = parseCedisToPesewas(v);
  if (p == null) throw invalid(`Invalid amount for ${k}.`);
  return p;
};
const pctToBps = (fd: FormData, k: string) => {
  const v = Number(str(fd, k) || '0');
  if (!Number.isFinite(v) || v < 0 || v > 50) throw invalid('Percentages must be between 0 and 50.');
  return Math.round(v * 100);
};
const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v === '' ? null : Number(v);
};

export async function restaurantAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await guard();
    const lat = num(fd, 'lat');
    const lng = num(fd, 'lng');
    if ((lat == null) !== (lng == null)) throw invalid('Enter both latitude and longitude, or neither.');
    const tz = str(fd, 'timezone') || 'Africa/Accra';
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
    } catch {
      throw invalid('Unknown timezone.');
    }
    await updateSettings(
      'restaurant',
      {
        isConfigured: bool(fd, 'isConfigured'),
        name: str(fd, 'name'),
        tagline: str(fd, 'tagline'),
        about: str(fd, 'about'),
        phone: str(fd, 'phone'),
        whatsapp: str(fd, 'whatsapp'),
        email: str(fd, 'email'),
        addressLine: str(fd, 'addressLine'),
        city: str(fd, 'city'),
        lat,
        lng,
        pickupInstructions: str(fd, 'pickupInstructions'),
        timezone: tz,
        instagram: str(fd, 'instagram'),
        facebook: str(fd, 'facebook'),
        tiktok: str(fd, 'tiktok'),
        x: str(fd, 'x'),
      },
      user.id,
    );
    await audit(sql, actorOf(user), 'settings.restaurant_updated', 'settings', 'restaurant');
    revalidatePath('/', 'layout');
  }, 'Restaurant details saved.');
}

export async function orderingAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await guard();
    const n = (k: string, d: number) => (str(fd, k) === '' ? d : Number(str(fd, k)));
    const next = await updateSettings(
      'ordering',
      {
        acceptingOrders: bool(fd, 'acceptingOrders'),
        pauseMessage: str(fd, 'pauseMessage') || 'We are not taking online orders right now.',
        pickupEnabled: bool(fd, 'pickupEnabled'),
        deliveryEnabled: bool(fd, 'deliveryEnabled'),
        autoAcceptOrders: bool(fd, 'autoAcceptOrders'),
        slotMinutes: n('slotMinutes', 15),
        slotCapacity: n('slotCapacity', 6),
        minLeadMinutes: n('minLeadMinutes', 20),
        maxDaysAhead: n('maxDaysAhead', 2),
        lastOrderBeforeCloseMinutes: n('lastOrderBeforeCloseMinutes', 15),
        paymentWindowMinutes: n('paymentWindowMinutes', 20),
        onlinePaymentsEnabled: bool(fd, 'onlinePaymentsEnabled'),
        cashOnPickupEnabled: bool(fd, 'cashOnPickupEnabled'),
        cashOnDeliveryEnabled: bool(fd, 'cashOnDeliveryEnabled'),
        serviceChargeBps: pctToBps(fd, 'serviceChargePct'),
        taxBps: pctToBps(fd, 'taxPct'),
        taxLabel: str(fd, 'taxLabel') || 'Taxes & levies',
        minOrderPesewas: money(fd, 'minOrder'),
        maxItemQuantity: n('maxItemQuantity', 20),
        allowCustomerCancelBeforeKitchen: bool(fd, 'allowCustomerCancelBeforeKitchen'),
        cancellationPolicy: str(fd, 'cancellationPolicy'),
        refundPolicy: str(fd, 'refundPolicy'),
      },
      user.id,
    );
    await audit(sql, actorOf(user), 'settings.ordering_updated', 'settings', 'ordering', next as unknown as Record<string, unknown>);
    revalidatePath('/', 'layout');
  }, 'Ordering settings saved.');
}

export async function deliveryAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await guard();
    const n = (k: string, d: number) => (str(fd, k) === '' ? d : Number(str(fd, k)));
    const next = await updateSettings(
      'delivery',
      {
        riderOnlineWindowSeconds: n('riderOnlineWindowSeconds', 120),
        locationStaleSeconds: n('locationStaleSeconds', 120),
        locationIntervalSeconds: n('locationIntervalSeconds', 20),
        locationRetentionDays: n('locationRetentionDays', 30),
        pinMaxAttempts: n('pinMaxAttempts', 5),
        allowManualZoneSelection: bool(fd, 'allowManualZoneSelection'),
        defaultRiderFeePesewas: money(fd, 'defaultRiderFee'),
      },
      user.id,
    );
    await updateSettings('inventory', { autoDeductOnPrep: bool(fd, 'autoDeductOnPrep') }, user.id);
    await updateSettings('notifications', { smsEnabled: bool(fd, 'smsEnabled'), emailEnabled: bool(fd, 'emailEnabled') }, user.id);
    await audit(sql, actorOf(user), 'settings.delivery_updated', 'settings', 'delivery', next as unknown as Record<string, unknown>);
    revalidatePath('/admin/settings');
  }, 'Saved.');
}

export async function hoursAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await guard();
    const rows: { weekday: number; opensAt: string; closesAt: string }[] = [];
    for (let d = 0; d < 7; d++) {
      for (let k = 0; k < 2; k++) {
        const o = str(fd, `o-${d}-${k}`);
        const c = str(fd, `c-${d}-${k}`);
        if (o || c) {
          if (!o || !c) throw invalid('Each opening period needs both a start and an end time.');
          rows.push({ weekday: d, opensAt: o.slice(0, 5), closesAt: c.slice(0, 5) });
        }
      }
    }
    await replaceOperatingHours(user, rows);
    revalidatePath('/', 'layout');
  }, 'Opening hours saved.');
}

export async function closureAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await guard();
    const tz = str(fd, 'tz') || 'Africa/Accra';
    const parse = (v: string) => {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      if (!m) throw invalid('Enter start and end date/time.');
      return zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], tz).toISOString();
    };
    await addClosure(user, { startsAt: parse(str(fd, 'startsAt')), endsAt: parse(str(fd, 'endsAt')), scope: (str(fd, 'scope') || 'all') as 'all', reason: str(fd, 'reason') });
    revalidatePath('/', 'layout');
  }, 'Closure added. Customers can’t book times during it.');
}

export async function removeClosureAction(id: number): Promise<ActionResult> {
  return runAction(async () => {
    await removeClosure(await guard(), id);
    revalidatePath('/', 'layout');
  }, 'Closure removed.');
}

export async function zoneAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await guard();
    const km = Number(str(fd, 'radiusKm'));
    if (!Number.isFinite(km) || km <= 0) throw invalid('Radius must be a positive number of kilometres.');
    await saveZone(user, {
      id: int(fd, 'id') ?? undefined,
      name: str(fd, 'name'),
      description: str(fd, 'description') || null,
      centerLat: Number(str(fd, 'centerLat')),
      centerLng: Number(str(fd, 'centerLng')),
      radiusM: Math.round(km * 1000),
      feePesewas: money(fd, 'fee'),
      minOrderPesewas: money(fd, 'minOrder'),
      etaMinMinutes: str(fd, 'etaMin') ? Number(str(fd, 'etaMin')) : null,
      etaMaxMinutes: str(fd, 'etaMax') ? Number(str(fd, 'etaMax')) : null,
      isActive: bool(fd, 'isActive'),
      sortOrder: int(fd, 'sortOrder') ?? 0,
    });
    revalidatePath('/admin/settings');
  }, 'Zone saved.');
}
