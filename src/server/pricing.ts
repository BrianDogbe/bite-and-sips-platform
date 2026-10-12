import 'server-only';
import { sql, type Db } from './db';
import { loadMenu, isItemOrderable, itemScheduleAllows, type MenuItem } from './menu';
import { getSettings, type OrderingSettings, type DeliverySettings } from './settings';
import { listZones, resolveZone, ZONE_ERRORS, type DeliveryZone } from './zones';
import { percentOf } from '@/lib/money';
import type { CartLineInput } from '@/lib/validation';

/**
 * Authoritative server-side pricing. The browser may display estimates, but the totals that
 * are charged are always produced here from database prices.
 */

export interface PricedModifier {
  id: number;
  group: string;
  name: string;
  pricePesewas: number;
}
export interface PricedLine {
  index: number;
  menuItemId: number;
  variantId: number | null;
  itemName: string;
  variantName: string | null;
  modifiers: PricedModifier[];
  allergens: string[];
  basePricePesewas: number;
  unitPricePesewas: number;
  quantity: number;
  lineTotalPesewas: number;
  instructions: string | null;
  prepMinutes: number;
}
export interface LineProblem {
  index: number;
  code: 'unavailable' | 'not_found' | 'invalid_variant' | 'invalid_modifier' | 'modifier_rules' | 'quantity' | 'schedule';
  message: string;
}
export interface Quote {
  lines: PricedLine[];
  problems: LineProblem[];
  subtotalPesewas: number;
  discountPesewas: number;
  deliveryFeePesewas: number;
  serviceChargePesewas: number;
  taxPesewas: number;
  totalPesewas: number;
  maxPrepMinutes: number;
  promo: { id: number; code: string; description: string | null } | null;
  promoError: string | null;
  zone: { id: number; name: string; verified: boolean; etaMinMinutes: number | null; etaMaxMinutes: number | null } | null;
  fulfillmentError: string | null;
  minOrderError: string | null;
  charges: { serviceChargeBps: number; taxBps: number; taxLabel: string };
}

export function priceLine(
  item: MenuItem | undefined,
  categoryActive: boolean,
  input: CartLineInput,
  index: number,
  opts: { maxQty: number; at: Date; tz: string },
): { line?: PricedLine; problem?: LineProblem } {
  if (!item) return { problem: { index, code: 'not_found', message: 'This item is no longer on the menu.' } };
  const orderable = isItemOrderable(item, categoryActive);
  if (!orderable.ok) return { problem: { index, code: 'unavailable', message: `${item.name} is ${orderable.reason}.` } };
  if (!itemScheduleAllows(item, opts.at, opts.tz)) {
    return { problem: { index, code: 'schedule', message: `${item.name} is not served at the selected time.` } };
  }
  if (input.quantity < 1 || input.quantity > opts.maxQty) {
    return { problem: { index, code: 'quantity', message: `Quantity for ${item.name} must be between 1 and ${opts.maxQty}.` } };
  }

  let base = item.basePricePesewas;
  let variantName: string | null = null;
  let variantId: number | null = null;
  if (item.variants.length) {
    const v = item.variants.find((x) => x.id === input.variantId);
    if (!v) return { problem: { index, code: 'invalid_variant', message: `Please choose an option for ${item.name}.` } };
    if (!v.isAvailable) return { problem: { index, code: 'unavailable', message: `${item.name} (${v.name}) is sold out.` } };
    base = v.pricePesewas;
    variantName = v.name;
    variantId = v.id;
  } else if (input.variantId) {
    return { problem: { index, code: 'invalid_variant', message: `Invalid option for ${item.name}.` } };
  }

  const chosen = new Set(input.modifierIds ?? []);
  if (chosen.size !== (input.modifierIds ?? []).length) {
    return { problem: { index, code: 'invalid_modifier', message: `Duplicate extras selected for ${item.name}.` } };
  }
  const modifiers: PricedModifier[] = [];
  const known = new Set<number>();
  for (const g of item.modifierGroups) {
    const picked = g.modifiers.filter((m) => chosen.has(m.id));
    for (const m of g.modifiers) known.add(m.id);
    if (picked.some((m) => !m.isAvailable)) {
      return { problem: { index, code: 'unavailable', message: `An extra you chose for ${item.name} is no longer available.` } };
    }
    if (picked.length < g.minSelect || picked.length > g.maxSelect) {
      const rule =
        g.minSelect === g.maxSelect ? `exactly ${g.minSelect}` : g.minSelect > 0 ? `${g.minSelect}–${g.maxSelect}` : `up to ${g.maxSelect}`;
      return { problem: { index, code: 'modifier_rules', message: `${item.name}: choose ${rule} for "${g.name}".` } };
    }
    for (const m of picked) modifiers.push({ id: m.id, group: g.name, name: m.name, pricePesewas: m.pricePesewas });
  }
  for (const id of chosen) {
    if (!known.has(id)) return { problem: { index, code: 'invalid_modifier', message: `Invalid extra selected for ${item.name}.` } };
  }

  const unit = base + modifiers.reduce((s, m) => s + m.pricePesewas, 0);
  return {
    line: {
      index,
      menuItemId: item.id,
      variantId,
      itemName: item.name,
      variantName,
      modifiers,
      allergens: item.allergensVerified ? item.allergens : [],
      basePricePesewas: base,
      unitPricePesewas: unit,
      quantity: input.quantity,
      lineTotalPesewas: unit * input.quantity,
      instructions: input.instructions?.trim() || null,
      prepMinutes: item.prepMinutes,
    },
  };
}

export interface PromotionRow {
  id: number;
  code: string;
  description: string | null;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minSubtotalPesewas: number;
  maxDiscountPesewas: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
}

export function evaluatePromotion(p: PromotionRow | undefined, subtotal: number, now: Date): { discount: number; error: string | null } {
  if (!p || !p.isActive) return { discount: 0, error: 'That promo code is not valid.' };
  if (p.startsAt && now < new Date(p.startsAt)) return { discount: 0, error: 'That promo code is not active yet.' };
  if (p.endsAt && now >= new Date(p.endsAt)) return { discount: 0, error: 'That promo code has expired.' };
  if (p.usageLimit != null && p.usedCount >= p.usageLimit) return { discount: 0, error: 'That promo code has been fully redeemed.' };
  if (subtotal < p.minSubtotalPesewas) return { discount: 0, error: 'Your order does not meet the minimum for this promo code.' };
  let d = p.discountType === 'percent' ? percentOf(subtotal, p.discountValue * 100) : p.discountValue;
  if (p.maxDiscountPesewas != null) d = Math.min(d, p.maxDiscountPesewas);
  return { discount: Math.min(d, subtotal), error: null };
}

export interface QuoteContext {
  menu?: Awaited<ReturnType<typeof loadMenu>>;
  ordering?: OrderingSettings;
  delivery?: DeliverySettings;
  zones?: DeliveryZone[];
  tz?: string;
  at?: Date;
}

export async function quote(
  input: {
    items: CartLineInput[];
    fulfillment?: { type: 'pickup' | 'delivery'; lat?: number | null; lng?: number | null; zoneId?: number | null };
    promoCode?: string | null;
  },
  ctx: QuoteContext = {},
  db: Db = sql,
): Promise<Quote> {
  const menu = ctx.menu ?? (await loadMenu({ includeArchived: true, includeInactiveCategories: true }, db));
  const ordering = ctx.ordering ?? (await getSettings('ordering', db));
  const delivery = ctx.delivery ?? (await getSettings('delivery', db));
  const tz = ctx.tz ?? (await getSettings('restaurant', db)).timezone;
  const at = ctx.at ?? new Date();

  const itemsById = new Map(menu.items.map((i) => [i.id, i]));
  const activeCats = new Set(menu.categories.filter((c) => c.isActive).map((c) => c.id));

  const lines: PricedLine[] = [];
  const problems: LineProblem[] = [];
  input.items.forEach((li, idx) => {
    const item = itemsById.get(li.menuItemId);
    const r = priceLine(item, item ? activeCats.has(item.categoryId) : false, li, idx, { maxQty: ordering.maxItemQuantity, at, tz });
    if (r.problem) problems.push(r.problem);
    if (r.line) lines.push(r.line);
  });

  const subtotal = lines.reduce((s, l) => s + l.lineTotalPesewas, 0);

  let promo: Quote['promo'] = null;
  let promoError: string | null = null;
  let discount = 0;
  if (input.promoCode && input.promoCode.trim()) {
    const rows = await db<PromotionRow[]>`select * from promotions where upper(code) = upper(${input.promoCode.trim()}) limit 1`;
    const ev = evaluatePromotion(rows[0], subtotal, at);
    if (ev.error) promoError = ev.error;
    else {
      discount = ev.discount;
      promo = { id: rows[0].id, code: rows[0].code, description: rows[0].description };
    }
  }

  let deliveryFee = 0;
  let zone: Quote['zone'] = null;
  let fulfillmentError: string | null = null;
  let minOrderError: string | null = null;
  if (input.fulfillment?.type === 'delivery') {
    if (!ordering.deliveryEnabled) fulfillmentError = 'Delivery is not available right now.';
    else {
      const zones = ctx.zones ?? (await listZones({ activeOnly: true }, db));
      const r = resolveZone(zones, input.fulfillment, delivery.allowManualZoneSelection);
      if (!r.ok) fulfillmentError = r.reason === 'no_location' ? null : ZONE_ERRORS[r.reason];
      else {
        deliveryFee = r.zone.feePesewas;
        zone = { id: r.zone.id, name: r.zone.name, verified: r.verified, etaMinMinutes: r.zone.etaMinMinutes, etaMaxMinutes: r.zone.etaMaxMinutes };
        if (subtotal < r.zone.minOrderPesewas) minOrderError = `The minimum order for delivery to ${r.zone.name} is GH₵${(r.zone.minOrderPesewas / 100).toFixed(2)}.`;
      }
    }
  } else if (input.fulfillment?.type === 'pickup' && !ordering.pickupEnabled) {
    fulfillmentError = 'Pickup is not available right now.';
  }
  if (!minOrderError && ordering.minOrderPesewas > 0 && subtotal < ordering.minOrderPesewas) {
    minOrderError = `The minimum order is GH₵${(ordering.minOrderPesewas / 100).toFixed(2)}.`;
  }

  const afterDiscount = subtotal - discount;
  const serviceCharge = percentOf(afterDiscount, ordering.serviceChargeBps);
  const tax = percentOf(afterDiscount + serviceCharge, ordering.taxBps);
  const total = afterDiscount + deliveryFee + serviceCharge + tax;

  return {
    lines,
    problems,
    subtotalPesewas: subtotal,
    discountPesewas: discount,
    deliveryFeePesewas: deliveryFee,
    serviceChargePesewas: serviceCharge,
    taxPesewas: tax,
    totalPesewas: total,
    maxPrepMinutes: lines.reduce((m, l) => Math.max(m, l.prepMinutes), 0),
    promo,
    promoError,
    zone,
    fulfillmentError,
    minOrderError,
    charges: { serviceChargeBps: ordering.serviceChargeBps, taxBps: ordering.taxBps, taxLabel: ordering.taxLabel },
  };
}
