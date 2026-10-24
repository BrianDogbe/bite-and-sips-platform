import 'server-only';
import { sql, type Db } from './db';
import { localParts, timeToMinutes } from '@/lib/time';
import { approvedPhoto } from '@/lib/brand-photos';

export interface MenuModifier {
  id: number;
  name: string;
  pricePesewas: number;
  isAvailable: boolean;
}
export interface MenuModifierGroup {
  id: number;
  name: string;
  minSelect: number;
  maxSelect: number;
  modifiers: MenuModifier[];
}
export interface MenuVariant {
  id: number;
  name: string;
  pricePesewas: number;
  isDefault: boolean;
  isAvailable: boolean;
}
export interface MenuItem {
  id: number;
  categoryId: number;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  imageAlt: string | null;
  basePricePesewas: number;
  prepMinutes: number;
  isAvailable: boolean;
  isFeatured: boolean;
  isArchived: boolean;
  dietaryTags: string[];
  allergens: string[];
  allergensVerified: boolean;
  availableDays: number[] | null;
  availableFrom: string | null;
  availableUntil: string | null;
  unavailableReason: string | null;
  isDemo: boolean;
  sortOrder: number;
  variants: MenuVariant[];
  modifierGroups: MenuModifierGroup[];
}
export interface MenuCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  isDemo: boolean;
}

/** Load the full menu (items + variants + modifiers) in four queries. */
export async function loadMenu(opts: { includeArchived?: boolean; includeInactiveCategories?: boolean } = {}, db: Db = sql) {
  const categories = await db<MenuCategory[]>`
    select id, name, slug, description, sort_order, is_active, is_demo from menu_categories
    where ${opts.includeInactiveCategories ?? false} or is_active
    order by sort_order, name`;
  const items = await db<Omit<MenuItem, 'variants' | 'modifierGroups'>[]>`
    select i.id, i.category_id, i.name, i.slug, i.description, i.image_url, i.image_alt, i.base_price_pesewas,
           i.prep_minutes, i.is_available, i.is_featured, i.is_archived, i.dietary_tags, i.allergens, i.allergens_verified,
           i.available_days, to_char(i.available_from, 'HH24:MI') as available_from,
           to_char(i.available_until, 'HH24:MI') as available_until, i.unavailable_reason, i.is_demo, i.sort_order
    from menu_items i
    where ${opts.includeArchived ?? false} or not i.is_archived
    order by i.sort_order, i.name`;
  const ids = items.map((i) => i.id);
  const variants = ids.length
    ? await db<(MenuVariant & { itemId: number })[]>`
        select id, item_id, name, price_pesewas, is_default, is_available from menu_variants
        where item_id = any(${ids}::int[]) order by sort_order, id`
    : [];
  const groups = ids.length
    ? await db<(Omit<MenuModifierGroup, 'modifiers'> & { itemId: number })[]>`
        select id, item_id, name, min_select, max_select from modifier_groups
        where item_id = any(${ids}::int[]) order by sort_order, id`
    : [];
  const gids = groups.map((g) => g.id);
  const mods = gids.length
    ? await db<(MenuModifier & { groupId: number })[]>`
        select id, group_id, name, price_pesewas, is_available from modifiers
        where group_id = any(${gids}::int[]) order by sort_order, id`
    : [];

  const modsByGroup = new Map<number, MenuModifier[]>();
  for (const m of mods) {
    const { groupId, ...rest } = m;
    (modsByGroup.get(groupId) ?? modsByGroup.set(groupId, []).get(groupId)!).push(rest);
  }
  const groupsByItem = new Map<number, MenuModifierGroup[]>();
  for (const g of groups) {
    const { itemId, ...rest } = g;
    (groupsByItem.get(itemId) ?? groupsByItem.set(itemId, []).get(itemId)!).push({ ...rest, modifiers: modsByGroup.get(g.id) ?? [] });
  }
  const variantsByItem = new Map<number, MenuVariant[]>();
  for (const v of variants) {
    const { itemId, ...rest } = v;
    (variantsByItem.get(itemId) ?? variantsByItem.set(itemId, []).get(itemId)!).push(rest);
  }
  const full: MenuItem[] = items.map((i) => ({
    ...i,
    dietaryTags: i.dietaryTags ?? [],
    allergens: i.allergens ?? [],
    variants: variantsByItem.get(i.id) ?? [],
    modifierGroups: groupsByItem.get(i.id) ?? [],
  }));
  return { categories, items: full };
}

/** Whether an item is orderable at `at` given its own schedule (opening hours are checked separately). */
export function itemScheduleAllows(item: Pick<MenuItem, 'availableDays' | 'availableFrom' | 'availableUntil'>, at: Date, tz: string): boolean {
  const p = localParts(at, tz);
  if (item.availableDays && item.availableDays.length && !item.availableDays.includes(p.weekday)) return false;
  const mins = p.hour * 60 + p.minute;
  if (item.availableFrom && mins < timeToMinutes(item.availableFrom)) return false;
  if (item.availableUntil && mins >= timeToMinutes(item.availableUntil)) return false;
  return true;
}

export function isItemOrderable(item: MenuItem, categoryActive: boolean): { ok: boolean; reason?: string } {
  if (item.isArchived || !categoryActive) return { ok: false, reason: 'no longer on the menu' };
  if (!item.isAvailable) return { ok: false, reason: item.unavailableReason || 'sold out' };
  if (item.variants.length && !item.variants.some((v) => v.isAvailable)) return { ok: false, reason: 'sold out' };
  return { ok: true };
}

/** Public, customer-safe menu payload. */
export async function publicMenu(db: Db = sql) {
  const { categories, items } = await loadMenu({}, db);
  const activeCats = new Set(categories.map((c) => c.id));
  return {
    categories,
    items: items
      .filter((i) => activeCats.has(i.categoryId))
      .map((i) => ({
        ...i,
        imageUrl: approvedPhoto(i.imageUrl),
        orderable: isItemOrderable(i, true).ok,
        unavailableReason: isItemOrderable(i, true).reason ?? null,
        allergens: i.allergensVerified ? i.allergens : [],
      })),
  };
}

export type PublicMenu = Awaited<ReturnType<typeof publicMenu>>;
export type PublicMenuItem = PublicMenu['items'][number];

/** Bestsellers derived from actual completed order data (empty for a new restaurant). */
export async function bestsellerIds(limit = 6, days = 30, db: Db = sql): Promise<number[]> {
  const rows = await db<{ menuItemId: number }[]>`
    select oi.menu_item_id, sum(oi.quantity) as qty
    from order_items oi join orders o on o.id = oi.order_id
    where o.status = 'completed' and not o.is_test and o.created_at > now() - make_interval(days => ${days})
      and oi.menu_item_id is not null
    group by oi.menu_item_id
    having sum(oi.quantity) >= 3
    order by qty desc
    limit ${limit}`;
  return rows.map((r) => r.menuItemId);
}
