/**
 * DEMONSTRATION DATA for local development and demos ONLY.
 *
 * - Every menu category, item and delivery zone created here is flagged is_demo = true and the
 *   storefront shows a "demo menu" banner while any demo items are visible.
 * - Names, prices, hours and zones are PLACEHOLDERS — not the real restaurant's information.
 * - Photos in public/brand are the restaurant's own (supplied by the owner). Items without a photo
 *   show a plain placeholder. The menu mirrors what the owner's flyers show; prices are placeholders.
 * - Demo staff accounts use a shared password and must never exist in production.
 *
 * Usage: npm run db:seed:demo            (refuses to run when NODE_ENV=production)
 *        npm run db:seed:demo -- --reset (removes previous demo data first)
 */
import postgres from 'postgres';
import { scryptSync, randomBytes } from 'node:crypto';
import { loadDotEnv } from './load-env';

loadDotEnv();
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data with NODE_ENV=production.');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

function hash(pw: string) {
  const logN = 15;
  const N = 2 ** logN;
  const salt = randomBytes(16);
  const key = scryptSync(pw.normalize('NFKC'), salt, 64, { N, r: 8, p: 1, maxmem: 256 * N * 8 });
  return `scrypt$${logN}$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

type Mod = [name: string, pricePesewas: number];
interface DemoItem {
  name: string;
  description: string;
  price: number;
  prep: number;
  image?: string;
  alt?: string;
  featured?: boolean;
  tags?: string[];
  variants?: [string, number][];
  groups?: { name: string; min: number; max: number; mods: Mod[] }[];
}

const MENU: { name: string; description: string; items: DemoItem[] }[] = [
  {
    name: 'Shawarma',
    description: 'Demo category',
    items: [
      {
        name: 'Chicken Shawarma',
        description: 'Grilled wrap filled with seasoned chicken, carrot slaw and our signature sauce. (Demo item — placeholder price.)',
        price: 3800,
        prep: 10,
        featured: true,
      },
      {
        name: 'Beef Shawarma',
        description: 'Grilled wrap filled with seasoned beef, fresh vegetables and our signature sauce. (Demo item — placeholder price.)',
        price: 4500,
        prep: 12,
      },
    ],
  },
  {
    name: 'Sandwiches',
    description: 'Demo category',
    items: [
      {
        name: 'Creamy Tuna Sandwich',
        description: 'Creamy tuna with fresh lettuce and sliced egg between soft bread. (Demo item — placeholder price.)',
        price: 3500,
        prep: 10,
        image: '/brand/tuna-sandwich.jpg',
        alt: 'Cut tuna and egg sandwiches stacked in a kraft box',
        featured: true,
        variants: [
          ['Single', 3500],
          ['Double', 6000],
        ],
      },
      {
        name: 'Egg & Chicken Loaded Sandwich',
        description: 'Toasted bread loaded with juicy chicken, egg and crunchy slaw, served with our signature sauce. (Demo item — placeholder price.)',
        price: 4000,
        prep: 12,
        featured: true,
        groups: [{ name: 'Sauce', min: 0, max: 2, mods: [['Signature sauce', 0], ['Pepper sauce', 0]] }],
      },
    ],
  },
  {
    name: 'Salads',
    description: 'Demo category',
    items: [
      {
        name: 'Crunchy Salad with Grilled Chicken',
        description: 'Fresh lettuce, cabbage and carrot with boiled eggs and juicy grilled chicken, with a pot of signature sauce. (Demo item — placeholder price.)',
        price: 4500,
        prep: 12,
        image: '/brand/crunchy-salad.jpg',
        alt: 'Salad with boiled egg, grilled chicken and a pot of sauce in a kraft tray',
        featured: true,
        variants: [
          ['Regular', 4500],
          ['Large', 6000],
        ],
        groups: [
          { name: 'Dressing', min: 1, max: 1, mods: [['Signature sauce', 0], ['No dressing', 0]] },
        ],
      },
    ],
  },
  {
    name: 'Combo',
    description: 'Demo category',
    items: [
      {
        name: 'Sandwich & Drink Combo',
        description: 'A Creamy Tuna Sandwich with a chilled milk drink of your choice. (Demo item — placeholder price.)',
        price: 5000,
        prep: 12,
        image: '/brand/tuna-sandwich.jpg',
        alt: 'Cut tuna and egg sandwiches stacked in a kraft box',
        featured: true,
        groups: [{ name: 'Choose your drink', min: 1, max: 1, mods: [['Strawberry Milk', 0], ['Chocolate Milk', 0]] }],
      },
      {
        name: 'Salad & Drink Combo',
        description: 'A Crunchy Salad with Grilled Chicken with a chilled milk drink of your choice. (Demo item — placeholder price.)',
        price: 6000,
        prep: 14,
        image: '/brand/crunchy-salad.jpg',
        alt: 'Salad with boiled egg, grilled chicken and a pot of sauce in a kraft tray',
        groups: [{ name: 'Choose your drink', min: 1, max: 1, mods: [['Strawberry Milk', 0], ['Chocolate Milk', 0]] }],
      },
      {
        name: 'Shawarma & Drink Combo',
        description: 'A Chicken Shawarma with a chilled milk drink of your choice. (Demo item — placeholder price.)',
        price: 5200,
        prep: 12,
        groups: [{ name: 'Choose your drink', min: 1, max: 1, mods: [['Strawberry Milk', 0], ['Chocolate Milk', 0]] }],
      },
      {
        name: 'Lunch for Two',
        description: 'Two sandwiches with one Strawberry Milk and one Chocolate Milk, ready together. (Demo item — placeholder price.)',
        price: 9500,
        prep: 15,
      },
      {
        name: 'Snack Box',
        description: 'A sandwich, a wrap, fruit, a snack and a drink in one box for sharing or a long meeting. (Demo item — placeholder price.)',
        price: 9500,
        prep: 20,
        image: '/brand/snack-box.jpg',
        alt: 'Open box with sandwiches, wraps, apples, a juice carton, a bottle and biscuits',
        featured: true,
      },
    ],
  },
  {
    name: 'Drinks',
    description: 'Demo category',
    items: [
      {
        name: 'Strawberry Milk',
        description: 'Milk blended with our signature strawberry fruit puree. (Demo item — placeholder price.)',
        price: 2500,
        prep: 5,
        variants: [
          ['Regular', 2500],
          ['Large', 3500],
        ],
      },
      {
        name: 'Chocolate Milk',
        description: 'Rich chocolate milk with a velvet chocolate swirl. (Demo item — placeholder price.)',
        price: 2500,
        prep: 5,
        variants: [
          ['Regular', 2500],
          ['Large', 3500],
        ],
      },
    ],
  },
];

const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  const reset = process.argv.includes('--reset');
  try {
    const real = await sql`select 1 from menu_items where not is_demo limit 1`;
    if (real.length && !process.argv.includes('--force')) {
      console.error('Real (non-demo) menu items exist. Refusing to add demo data. Use --force to add anyway.');
      process.exit(1);
    }
    await sql.begin(async (t) => {
      if (reset) {
        await t`delete from menu_items where is_demo and id not in (select menu_item_id from order_items where menu_item_id is not null)`;
        await t`update menu_items set is_archived = true where is_demo`;
        await t`delete from menu_categories where is_demo and id not in (select category_id from menu_items)`;
        await t`delete from delivery_zones where is_demo`;
      }
      const existing = await t`select 1 from menu_categories where is_demo limit 1`;
      if (existing.length && !reset) {
        console.log('Demo menu already present (use --reset to recreate).');
      } else {
        let cs = 0;
        for (const c of MENU) {
          const [cat] = await t<{ id: number }[]>`
            insert into menu_categories (name, slug, description, sort_order, is_demo) values (${c.name}, ${'demo-' + slug(c.name)}, ${c.description}, ${cs++}, true)
            on conflict (slug) do update set is_active = true, name = excluded.name, sort_order = excluded.sort_order returning id`;
          let is = 0;
          for (const it of c.items) {
            const [item] = await t<{ id: number }[]>`
              insert into menu_items (category_id, name, slug, description, image_url, image_alt, base_price_pesewas, prep_minutes, is_featured, dietary_tags, sort_order, is_demo)
              values (${cat.id}, ${it.name}, ${'demo-' + slug(it.name) + '-' + randomBytes(2).toString('hex')}, ${it.description}, ${it.image ?? null}, ${it.alt ?? null},
                      ${it.price}, ${it.prep}, ${it.featured ?? false}, ${it.tags ?? []}, ${is++}, true)
              returning id`;
            for (const [i, [name, price]] of (it.variants ?? []).entries()) {
              await t`insert into menu_variants (item_id, name, price_pesewas, is_default, sort_order) values (${item.id}, ${name}, ${price}, ${i === 0}, ${i})`;
            }
            for (const [gi, g] of (it.groups ?? []).entries()) {
              const [grp] = await t<{ id: number }[]>`insert into modifier_groups (item_id, name, min_select, max_select, sort_order) values (${item.id}, ${g.name}, ${g.min}, ${g.max}, ${gi}) returning id`;
              for (const [mi, [name, price]] of g.mods.entries()) {
                await t`insert into modifiers (group_id, name, price_pesewas, sort_order) values (${grp.id}, ${name}, ${Math.max(0, price)}, ${mi})`;
              }
            }
          }
        }
        console.log('✓ demo menu created (flagged is_demo)');
      }

      const hours = await t`select 1 from operating_hours limit 1`;
      if (!hours.length) {
        for (let d = 1; d <= 6; d++) await t`insert into operating_hours (weekday, opens_at, closes_at) values (${d}, '10:00', '21:00')`;
        await t`insert into operating_hours (weekday, opens_at, closes_at) values (0, '12:00', '20:00')`;
        console.log('✓ placeholder opening hours (Mon–Sat 10:00–21:00, Sun 12:00–20:00) — replace in Admin → Settings');
      }

      const zones = await t`select 1 from delivery_zones limit 1`;
      if (!zones.length) {
        // Placeholder: one zone covering anywhere in Tema (approximate centre, 7 km). Check it against a map and adjust in Admin.
        const c = { lat: 5.6698, lng: -0.0166 };
        await t`insert into delivery_zones (name, description, center_lat, center_lng, radius_m, fee_pesewas, per_km_pesewas, max_fee_pesewas, min_order_pesewas, eta_min_minutes, eta_max_minutes, sort_order, is_demo)
                values ('Tema', 'Delivery anywhere in Tema', ${c.lat}, ${c.lng}, 7000, 800, 200, 4000, 0, 25, 45, 1, true)`;
        await t`insert into settings (key, value) values ('restaurant', ${t.json({ isConfigured: false, name: 'Bite & Sips', tagline: 'Good food. Good mood.', phone: '+233 24 469 3556', addressLine: 'Tema C7', lat: c.lat, lng: c.lng, timezone: 'Africa/Accra' })})
                on conflict (key) do nothing`;
        console.log('✓ placeholder delivery zone covering Tema — check and replace in Admin → Settings → Delivery zones');
      }
      await t`insert into settings (key, value) values ('ordering', ${t.json({ cashOnPickupEnabled: true })}) on conflict (key) do nothing`;

      if (process.argv.includes('--staff')) {
        const pw = 'demo-password-123';
        const people: [string, string, string[]][] = [
          ['Demo Owner', 'owner@demo.local', ['owner']],
          ['Demo Kitchen', 'kitchen@demo.local', ['kitchen']],
          ['Demo Rider', 'rider@demo.local', ['rider']],
        ];
        for (const [name, email, roles] of people) {
          const ex = await t`select 1 from users where lower(email) = ${email}`;
          if (ex.length) continue;
          const [u] = await t<{ id: string }[]>`insert into users (email, full_name, phone, password_hash) values (${email}, ${name}, ${'+2332000000' + people.findIndex((p) => p[1] === email)}, ${hash(pw)}) returning id`;
          for (const r of roles) await t`insert into user_roles (user_id, role) values (${u.id}, ${r})`;
          if (roles.includes('rider')) await t`insert into rider_profiles (user_id) values (${u.id})`;
        }
        console.log(`✓ demo staff accounts (*@demo.local) with password "${pw}" — DEVELOPMENT ONLY`);
      }
    });
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
