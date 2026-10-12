import Link from 'next/link';
import { requirePagePerm } from '@/server/auth/current';
import { loadMenu } from '@/server/menu';
import { formatGHS } from '@/lib/money';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { ActionButton } from '@/components/ActionButton';
import { Badge } from '@/components/Badge';
import { categoryAction, availabilityAction, archiveAction, deleteCategoryAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Menu' };

export default async function MenuAdmin({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  await requirePagePerm('menu.manage', '/admin/login');
  const sp = await searchParams;
  const { categories, items } = await loadMenu({ includeArchived: sp.archived === '1', includeInactiveCategories: true });
  const demoCount = items.filter((i) => i.isDemo && !i.isArchived).length;
  return (
    <>
      <div className="admin-top">
        <h1>Menu</h1>
        <div className="row">
          <Link className="btn ghost sm" href={sp.archived === '1' ? '/admin/menu' : '/admin/menu?archived=1'}>
            {sp.archived === '1' ? 'Hide archived' : 'Show archived'}
          </Link>
          <Link className="btn primary" href="/admin/menu/new">
            Add a dish
          </Link>
        </div>
      </div>
      {demoCount > 0 && (
        <p className="alert warn">
          {demoCount} item(s) are demo placeholders. Edit them with real details (saving removes the demo flag) or archive them before launch.
        </p>
      )}
      <div className="two-col">
        <div className="stack" style={{ ['--stack' as string]: '18px' }}>
          {categories.length === 0 && (
            <div className="empty panel">
              <h3>Start with a category</h3>
              <p>For example “Rice dishes”, “Grills” or “Drinks”. Then add dishes to it.</p>
            </div>
          )}
          {categories.map((c) => {
            const list = items.filter((i) => i.categoryId === c.id);
            return (
              <section key={c.id} className="panel tight">
                <div className="row between">
                  <h2 style={{ fontSize: '1.15rem', margin: 0 }}>
                    {c.name} {!c.isActive && <Badge tone="neutral">Hidden</Badge>} {c.isDemo && <Badge tone="warn">Demo</Badge>}
                  </h2>
                  {list.length === 0 && <ActionButton className="btn sm ghost" action={deleteCategoryAction.bind(null, c.id)} confirm="Delete this empty category?">Delete</ActionButton>}
                </div>
                {list.length === 0 ? (
                  <p className="muted small">No dishes yet.</p>
                ) : (
                  <div className="table-wrap" style={{ marginTop: 10 }}>
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Dish</th>
                          <th className="num">Price</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((i) => (
                          <tr key={i.id}>
                            <td>
                              <Link href={`/admin/menu/${i.id}`} style={{ fontWeight: 700 }}>
                                {i.name}
                              </Link>
                              <div className="small muted">
                                {i.variants.length ? `${i.variants.length} sizes` : 'Single price'}
                                {i.modifierGroups.length ? `, ${i.modifierGroups.length} option groups` : ''}, {i.prepMinutes} min prep
                                {!i.imageUrl ? ', no photo' : ''}
                              </div>
                            </td>
                            <td className="num">{i.variants.length ? `from ${formatGHS(Math.min(...i.variants.map((v) => v.pricePesewas)))}` : formatGHS(i.basePricePesewas)}</td>
                            <td>
                              {i.isArchived ? <Badge tone="neutral">Archived</Badge> : i.isAvailable ? <Badge tone="ok">Available</Badge> : <Badge tone="danger">Sold out</Badge>}
                              {i.isFeatured && !i.isArchived && <> <Badge tone="info">Featured</Badge></>}
                              {i.isDemo && <> <Badge tone="warn">Demo</Badge></>}
                            </td>
                            <td className="nowrap">
                              {!i.isArchived && <ActionButton className="btn sm" action={availabilityAction.bind(null, i.id, !i.isAvailable)}>{i.isAvailable ? 'Sold out' : 'Available'}</ActionButton>}{' '}
                              <ActionButton className="btn sm ghost" action={archiveAction.bind(null, i.id, !i.isArchived)} confirm={i.isArchived ? undefined : `Archive ${i.name}? It disappears from the menu but stays in order history.`}>
                                {i.isArchived ? 'Restore' : 'Archive'}
                              </ActionButton>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <aside className="stack" style={{ ['--stack' as string]: '18px' }}>
          <section className="panel">
            <h2 style={{ fontSize: '1.15rem' }}>Add a category</h2>
            <ActionForm action={categoryAction} className="stack" resetOnSuccess>
              <div className="field">
                <label htmlFor="cname">Name</label>
                <input id="cname" name="name" className="input" required maxLength={60} />
              </div>
              <div className="field">
                <label htmlFor="cdesc">Description (optional)</label>
                <input id="cdesc" name="description" className="input" maxLength={300} />
              </div>
              <div className="field">
                <label htmlFor="csort">Position</label>
                <input id="csort" name="sortOrder" type="number" min={0} className="input" defaultValue={categories.length} />
              </div>
              <label className="check">
                <input type="checkbox" name="isActive" defaultChecked /> Visible on the menu
              </label>
              <SubmitButton>Add category</SubmitButton>
            </ActionForm>
          </section>
          {categories.length > 0 && (
            <section className="panel">
              <h2 style={{ fontSize: '1.15rem' }}>Edit categories</h2>
              {categories.map((c) => (
                <details key={c.id} style={{ marginBottom: 8 }}>
                  <summary>{c.name}</summary>
                  <ActionForm action={categoryAction} className="stack">
                    <input type="hidden" name="id" value={c.id} />
                    <input name="name" className="input" defaultValue={c.name} required aria-label="Name" />
                    <input name="description" className="input" defaultValue={c.description ?? ''} aria-label="Description" />
                    <input name="sortOrder" type="number" className="input" defaultValue={c.sortOrder} aria-label="Position" />
                    <label className="check">
                      <input type="checkbox" name="isActive" defaultChecked={c.isActive} /> Visible
                    </label>
                    <SubmitButton className="btn sm">Save</SubmitButton>
                  </ActionForm>
                </details>
              ))}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
