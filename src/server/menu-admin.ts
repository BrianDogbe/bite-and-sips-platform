import 'server-only';
import { z } from 'zod';
import { sql, tx, type Db, notifyChange } from './db';
import { conflict, invalid, notFound } from './errors';
import { audit } from './audit';
import { requirePerm, requireAnyPerm, actorOf } from './auth/guard';
import type { SessionUser } from './auth/sessions';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item';

export const categoryInput = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});

export async function saveCategory(user: SessionUser | null, raw: unknown, db: Db = sql) {
  requirePerm(user, 'menu.manage');
  const p = categoryInput.safeParse(raw);
  if (!p.success) throw invalid('Please check the category details.', p.error.flatten());
  const c = p.data;
  return tx(async (t) => {
    let id = c.id;
    if (id) {
      const r = await t`update menu_categories set name = ${c.name}, description = ${c.description ?? null}, sort_order = ${c.sortOrder}, is_active = ${c.isActive}, is_demo = false where id = ${id} returning id`;
      if (!r.length) throw notFound('Category');
    } else {
      const slug = await uniqueSlug(t, 'menu_categories', slugify(c.name));
      const [row] = await t<{ id: number }[]>`insert into menu_categories (name, slug, description, sort_order, is_active) values (${c.name}, ${slug}, ${c.description ?? null}, ${c.sortOrder}, ${c.isActive}) returning id`;
      id = row.id;
    }
    await audit(t, actorOf(user), c.id ? 'menu.category_updated' : 'menu.category_created', 'menu_category', id!, c);
    await notifyChange(t, { topic: 'menu' });
    return id!;
  }, db);
}

const variantInput = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(40),
  pricePesewas: z.number().int().min(0).max(10_000_00),
  isDefault: z.boolean().default(false),
  isAvailable: z.boolean().default(true),
});
const modifierInput = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(60),
  pricePesewas: z.number().int().min(0).max(1_000_00),
  isAvailable: z.boolean().default(true),
});
const groupInput = z
  .object({
    id: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(60),
    minSelect: z.number().int().min(0).max(20),
    maxSelect: z.number().int().min(1).max(20),
    modifiers: z.array(modifierInput).min(1).max(30),
  })
  .refine((g) => g.maxSelect >= g.minSelect, { message: 'Maximum must be at least the minimum' })
  .refine((g) => g.minSelect <= g.modifiers.length, { message: 'Minimum selections exceed the number of options' });

export const itemInput = z.object({
  id: z.number().int().positive().optional(),
  categoryId: z.number().int().positive(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(600).default(''),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .refine((u) => !u || u.startsWith('/media/') || /^https:\/\/images\.unsplash\.com\//.test(u), 'Upload an image, or use an approved image host')
    .optional()
    .nullable(),
  imageAlt: z.string().trim().max(150).optional().nullable(),
  basePricePesewas: z.number().int().min(0).max(10_000_00),
  prepMinutes: z.number().int().min(0).max(240),
  isAvailable: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  dietaryTags: z.array(z.enum(['vegetarian', 'vegan', 'spicy', 'gluten_free', 'halal'])).max(5).default([]),
  allergens: z.array(z.string().trim().min(2).max(30)).max(14).default([]),
  allergensVerified: z.boolean().default(false),
  availableDays: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
  availableFrom: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  availableUntil: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  variants: z.array(variantInput).max(10).default([]),
  modifierGroups: z.array(groupInput).max(10).default([]),
});
export type ItemInput = z.infer<typeof itemInput>;

/**
 * Create or update a menu item with its variants and modifier groups. Existing variants/modifiers
 * are updated in place by id (historical orders keep their own snapshots either way); removed ones
 * are deleted.
 */
export async function saveItem(user: SessionUser | null, raw: unknown, db: Db = sql) {
  requirePerm(user, 'menu.manage');
  const p = itemInput.safeParse(raw);
  if (!p.success) throw invalid('Please check the item details.', p.error.flatten());
  const it = p.data;
  if (it.variants.length && it.variants.filter((v) => v.isDefault).length > 1) throw invalid('Only one size/option can be the default.');
  if ((it.availableFrom && !it.availableUntil) || (!it.availableFrom && it.availableUntil)) throw invalid('Set both "available from" and "available until", or neither.');
  if (it.availableFrom && it.availableUntil && it.availableFrom >= it.availableUntil) throw invalid('"Available from" must be before "available until".');

  return tx(async (t) => {
    const cat = await t`select 1 from menu_categories where id = ${it.categoryId}`;
    if (!cat.length) throw invalid('Choose a valid category.');
    let id = it.id;
    const basePrice = it.variants.length ? Math.min(...it.variants.map((v) => v.pricePesewas)) : it.basePricePesewas;
    const days = it.availableDays && it.availableDays.length && it.availableDays.length < 7 ? it.availableDays : null;
    if (id) {
      const r = await t`
        update menu_items set category_id = ${it.categoryId}, name = ${it.name}, description = ${it.description}, image_url = ${it.imageUrl ?? null},
          image_alt = ${it.imageAlt ?? null}, base_price_pesewas = ${basePrice}, prep_minutes = ${it.prepMinutes}, is_available = ${it.isAvailable},
          is_featured = ${it.isFeatured}, dietary_tags = ${it.dietaryTags}, allergens = ${it.allergens}, allergens_verified = ${it.allergensVerified},
          available_days = ${days}, available_from = ${it.availableFrom ?? null}, available_until = ${it.availableUntil ?? null},
          sort_order = ${it.sortOrder}, is_demo = false, updated_at = now()
        where id = ${id} returning id`;
      if (!r.length) throw notFound('Menu item');
    } else {
      const slug = await uniqueSlug(t, 'menu_items', slugify(it.name));
      const [row] = await t<{ id: number }[]>`
        insert into menu_items (category_id, name, slug, description, image_url, image_alt, base_price_pesewas, prep_minutes, is_available, is_featured,
          dietary_tags, allergens, allergens_verified, available_days, available_from, available_until, sort_order)
        values (${it.categoryId}, ${it.name}, ${slug}, ${it.description}, ${it.imageUrl ?? null}, ${it.imageAlt ?? null}, ${basePrice}, ${it.prepMinutes},
          ${it.isAvailable}, ${it.isFeatured}, ${it.dietaryTags}, ${it.allergens}, ${it.allergensVerified}, ${days}, ${it.availableFrom ?? null},
          ${it.availableUntil ?? null}, ${it.sortOrder})
        returning id`;
      id = row.id;
    }

    // Variants
    const keepV: number[] = [];
    for (const [i, v] of it.variants.entries()) {
      if (v.id) {
        const r = await t`update menu_variants set name = ${v.name}, price_pesewas = ${v.pricePesewas}, is_default = ${v.isDefault}, is_available = ${v.isAvailable}, sort_order = ${i}
                          where id = ${v.id} and item_id = ${id} returning id`;
        if (!r.length) throw invalid('Unknown size/option.');
        keepV.push(v.id);
      } else {
        const [r] = await t<{ id: number }[]>`insert into menu_variants (item_id, name, price_pesewas, is_default, is_available, sort_order)
                                values (${id}, ${v.name}, ${v.pricePesewas}, ${v.isDefault}, ${v.isAvailable}, ${i}) returning id`;
        keepV.push(r.id);
      }
    }
    await t`delete from menu_variants where item_id = ${id} and not (id = any(${keepV}::int[]))`;

    // Modifier groups
    const keepG: number[] = [];
    for (const [gi, g] of it.modifierGroups.entries()) {
      let gid = g.id;
      if (gid) {
        const r = await t`update modifier_groups set name = ${g.name}, min_select = ${g.minSelect}, max_select = ${g.maxSelect}, sort_order = ${gi}
                          where id = ${gid} and item_id = ${id} returning id`;
        if (!r.length) throw invalid('Unknown option group.');
      } else {
        const [r] = await t<{ id: number }[]>`insert into modifier_groups (item_id, name, min_select, max_select, sort_order)
                                values (${id}, ${g.name}, ${g.minSelect}, ${g.maxSelect}, ${gi}) returning id`;
        gid = r.id;
      }
      keepG.push(gid!);
      const keepM: number[] = [];
      for (const [mi, m] of g.modifiers.entries()) {
        if (m.id) {
          const r = await t`update modifiers set name = ${m.name}, price_pesewas = ${m.pricePesewas}, is_available = ${m.isAvailable}, sort_order = ${mi}
                            where id = ${m.id} and group_id = ${gid} returning id`;
          if (!r.length) throw invalid('Unknown option.');
          keepM.push(m.id);
        } else {
          const [r] = await t<{ id: number }[]>`insert into modifiers (group_id, name, price_pesewas, is_available, sort_order)
                                  values (${gid}, ${m.name}, ${m.pricePesewas}, ${m.isAvailable}, ${mi}) returning id`;
          keepM.push(r.id);
        }
      }
      await t`delete from modifiers where group_id = ${gid} and not (id = any(${keepM}::int[]))`;
    }
    await t`delete from modifier_groups where item_id = ${id} and not (id = any(${keepG}::int[]))`;

    await audit(t, actorOf(user), it.id ? 'menu.item_updated' : 'menu.item_created', 'menu_item', id!, { name: it.name, basePricePesewas: basePrice });
    await notifyChange(t, { topic: 'menu' });
    return id!;
  }, db);
}

/** Mark sold out / available. Kitchen staff can do this (menu.availability). */
export async function setItemAvailability(user: SessionUser | null, itemId: number, available: boolean, reason: string | null, db: Db = sql) {
  requireAnyPerm(user, ['menu.manage', 'menu.availability']);
  return tx(async (t) => {
    const r = await t<{ name: string }[]>`
      update menu_items set is_available = ${available}, unavailable_reason = ${available ? null : reason || 'Sold out'}, updated_at = now()
      where id = ${itemId} and not is_archived returning name`;
    if (!r.length) throw notFound('Menu item');
    if (!available) {
      await t`insert into operational_exceptions (menu_item_id, kind, message, raised_by)
              values (${itemId}, 'item_unavailable', ${`${r[0].name} marked unavailable${reason ? `: ${reason}` : ''}`}, ${user!.id})`;
    } else {
      await t`update operational_exceptions set resolved_at = now(), resolved_by = ${user!.id}, resolution = 'Back in stock'
              where menu_item_id = ${itemId} and kind = 'item_unavailable' and resolved_at is null`;
    }
    await audit(t, actorOf(user), available ? 'menu.item_available' : 'menu.item_sold_out', 'menu_item', itemId, { reason });
    await notifyChange(t, { topic: 'menu' });
    await notifyChange(t, { topic: 'kitchen' });
    await notifyChange(t, { topic: 'admin' });
  }, db);
}

export async function archiveItem(user: SessionUser | null, itemId: number, archived: boolean, db: Db = sql) {
  requirePerm(user, 'menu.manage');
  return tx(async (t) => {
    const r = await t`update menu_items set is_archived = ${archived}, is_featured = false, updated_at = now() where id = ${itemId} returning id`;
    if (!r.length) throw notFound('Menu item');
    await audit(t, actorOf(user), archived ? 'menu.item_archived' : 'menu.item_restored', 'menu_item', itemId);
    await notifyChange(t, { topic: 'menu' });
  }, db);
}

export async function deleteCategory(user: SessionUser | null, categoryId: number, db: Db = sql) {
  requirePerm(user, 'menu.manage');
  return tx(async (t) => {
    const used = await t`select 1 from menu_items where category_id = ${categoryId} limit 1`;
    if (used.length) throw conflict('Move or archive the items in this category first (archived items still belong to it). Hide the category instead.');
    await t`delete from menu_categories where id = ${categoryId}`;
    await audit(t, actorOf(user), 'menu.category_deleted', 'menu_category', categoryId);
  }, db);
}

async function uniqueSlug(t: Db, table: 'menu_items' | 'menu_categories', base: string) {
  let slug = base;
  for (let i = 2; i < 200; i++) {
    const r = await t`select 1 from ${t(table)} where slug = ${slug}`;
    if (!r.length) return slug;
    slug = `${base}-${i}`;
  }
  throw new Error('Could not allocate slug');
}
