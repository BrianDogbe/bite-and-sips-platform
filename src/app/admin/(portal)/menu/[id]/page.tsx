import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePerm } from '@/server/auth/current';
import { loadMenu } from '@/server/menu';
import { ItemEditor } from '@/components/admin/ItemEditor';
import { recipeFor, listStock } from '@/server/inventory';
import { RecipeEditor } from '@/components/admin/RecipeEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit dish' };

export default async function EditItem({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePerm('menu.manage', '/admin/login');
  const { id } = await params;
  const { categories, items } = await loadMenu({ includeArchived: true, includeInactiveCategories: true });
  const isNew = id === 'new';
  const item = isNew ? null : items.find((i) => i.id === Number(id));
  if (!isNew && !item) notFound();
  const canInv = user.permissions.has('inventory.manage');
  const [recipe, stock] = item && canInv ? await Promise.all([recipeFor(item.id), listStock()]) : [[], []];
  return (
    <>
      <div className="admin-top">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link href="/admin/menu">Menu</Link>
          </p>
          <h1>{item ? item.name : 'Add a dish'}</h1>
        </div>
      </div>
      {categories.length === 0 ? (
        <p className="alert warn">
          Create a category first on the <Link href="/admin/menu">menu page</Link>.
        </p>
      ) : (
        <ItemEditor categories={categories.map((c) => ({ id: c.id, name: c.name }))} item={item ? JSON.parse(JSON.stringify(item)) : null} />
      )}
      {item && canInv && (
        <section className="panel" style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: '1.15rem' }}>Recipe (for stock deduction)</h2>
          <p className="muted small">Ingredients used for one portion. Only used when automatic stock deduction is switched on in Settings.</p>
          <RecipeEditor
            menuItemId={item.id}
            variants={item.variants.map((v) => ({ id: v.id, name: v.name }))}
            stock={stock.map((s) => ({ id: s.id, name: s.name, unit: s.unit }))}
            initial={recipe.map((r) => ({ stockItemId: r.stockItemId, variantId: r.variantId, quantity: Number(r.quantity) }))}
          />
        </section>
      )}
    </>
  );
}
