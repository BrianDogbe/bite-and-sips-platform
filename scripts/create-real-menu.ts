/**
 * Creates the real menu from the starter (demo) menu, then removes the demo menu.
 *
 * For every demo category and dish this makes a brand-new, normal (non-demo) category/dish with the same name,
 * price, sizes, extras, prep time and settings, a clean description (the "(Demo item — placeholder price.)" note
 * is dropped) and a clean web address. The demo rows are then deleted; any demo dish that a past test order still
 * points to is archived instead (hidden from the site, kept for that order's history).
 * Delivery zones are not touched.
 *
 * Usage: npx tsx scripts/create-real-menu.ts
 */
import postgres from 'postgres';
import { loadDotEnv } from './load-env';

loadDotEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const cleanDescription = (s: string) => s.replace(/\s*\(Demo item[^)]*\)/g, '').trim();

async function main() {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (t) => {
      const uniqueSlug = async (table: 'menu_categories' | 'menu_items', base: string) => {
        let s = base || 'item';
        for (let n = 2; ; n++) {
          const [hit] = await t`select 1 from ${t(table)} where slug = ${s}`;
          if (!hit) return s;
          s = `${base}-${n}`;
        }
      };

      const cats = await t<{ id: number; name: string; slug: string; description: string | null; sort_order: number; is_active: boolean }[]>`
        select id, name, slug, description, sort_order, is_active from menu_categories
         where is_demo or slug like 'demo-%' order by sort_order, id`;
      let dishes = 0;
      const sourceItemIds: number[] = [];
      for (const c of cats) {
        const items = await t<Record<string, any>[]>`
          select * from menu_items where category_id = ${c.id} and not is_archived order by sort_order, id`;
        if (!items.length) continue;
        const [newCat] = await t<{ id: number }[]>`
          insert into menu_categories (name, slug, description, sort_order, is_active, is_demo)
          values (${c.name}, ${await uniqueSlug('menu_categories', c.slug.replace(/^demo-/, ''))},
                  ${c.description === 'Demo category' ? null : c.description}, ${c.sort_order}, ${c.is_active}, false)
          returning id`;
        for (const it of items) {
          sourceItemIds.push(it.id);
          const base = String(it.slug).replace(/^demo-/, '').replace(/-[0-9a-f]{4}$/, '');
          const [n] = await t<{ id: number }[]>`
            insert into menu_items (category_id, name, slug, description, image_url, image_alt, base_price_pesewas, prep_minutes,
                                    is_available, is_featured, is_archived, dietary_tags, allergens, allergens_verified,
                                    available_days, available_from, available_until, sort_order, unavailable_reason, is_demo)
            values (${newCat.id}, ${it.name}, ${await uniqueSlug('menu_items', base)}, ${cleanDescription(it.description ?? '')},
                    ${it.image_url}, ${it.image_alt}, ${it.base_price_pesewas}, ${it.prep_minutes},
                    ${it.is_available}, ${it.is_featured}, false, ${it.dietary_tags}, ${it.allergens}, ${it.allergens_verified},
                    ${it.available_days}, ${it.available_from}, ${it.available_until}, ${it.sort_order}, ${it.unavailable_reason}, false)
            returning id`;
          await t`insert into menu_variants (item_id, name, price_pesewas, is_default, is_available, sort_order)
                  select ${n.id}, name, price_pesewas, is_default, is_available, sort_order from menu_variants where item_id = ${it.id}`;
          const groups = await t<{ id: number; name: string; min_select: number; max_select: number; sort_order: number }[]>`
            select id, name, min_select, max_select, sort_order from modifier_groups where item_id = ${it.id} order by sort_order, id`;
          for (const g of groups) {
            const [ng] = await t<{ id: number }[]>`
              insert into modifier_groups (item_id, name, min_select, max_select, sort_order)
              values (${n.id}, ${g.name}, ${g.min_select}, ${g.max_select}, ${g.sort_order}) returning id`;
            await t`insert into modifiers (group_id, name, price_pesewas, is_available, sort_order)
                    select ${ng.id}, name, price_pesewas, is_available, sort_order from modifiers where group_id = ${g.id}`;
          }
          dishes++;
        }
      }

      // Remove the demo menu. Dishes that past orders still point to are archived instead of deleted.
      let removed = 0;
      let archived = 0;
      for (const id of sourceItemIds) {
        const [used] = await t`select 1 from order_items where menu_item_id = ${id} limit 1`;
        if (used) {
          await t`update menu_items set is_archived = true, updated_at = now() where id = ${id}`;
          archived++;
        } else {
          await t`delete from menu_items where id = ${id}`;
          removed++;
        }
      }
      for (const c of cats) {
        const [left] = await t`select 1 from menu_items where category_id = ${c.id} limit 1`;
        if (!left) await t`delete from menu_categories where id = ${c.id}`;
        else await t`update menu_categories set is_active = false where id = ${c.id}`;
      }
      console.log(`Done: ${dishes} dishes created in your real menu. Demo menu removed (${removed} deleted, ${archived} hidden because test orders used them).`);
    });
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
