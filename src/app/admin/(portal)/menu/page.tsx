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
        <div>
          <h1>Menu</h1>
          <p className="muted" style={{ margin: 0 }}>
            {items.filter((i) => !i.isArchived).length} dishes in {categories.length} categories
          </p>
        </div>
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
        <p className="alert warn" style={{ marginBottom: 28 }}>
          {demoCount} item(s) are demo placeholders. Edit them with real details (saving removes the demo flag) or archive them before launch.
        </p>
      )}
      <div className="two-col menu-layout">
        <div className="menu-cats">
          {categories.length === 0 && (
            <div className="empty panel">
              <h3>Start with a category</h3>
              <p>For example “Rice dishes”, “Grills” or “Drinks”. Then add dishes to it.</p>
            </div>
          )}
          {categories.map((c) => {
            const list = items.filter((i) => i.categoryId === c.id);
            return (
              <section key={c.id} className="panel menu-cat">
                <div className="menu-cat-head">
                  <h2>
                    {c.name} <span className="dsp-count">{list.length}</span> {!c.isActive && <Badge tone="neutral">Hidden</Badge>} {c.isDemo && <Badge tone="warn">Demo</Badge>}
                  </h2>
                  {list.length === 0 && <ActionButton className="btn sm ghost" action={deleteCategoryAction.bind(null, c.id)} confirm="Delete this empty category?">Delete</ActionButton>}
                </div>
                {list.length === 0 ? (
                  <p className="dsp-empty">No dishes yet.</p>
                ) : (
                  <div className="mdish-grid">
                    {list.map((i) => (
                      <article key={i.id} className={`mdish${i.isArchived ? ' archived' : ''}`}>
                        <Link href={`/admin/menu/${i.id}`} className="mdish-img" aria-label={`Edit ${i.name}`}>
                          {i.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={i.imageUrl} alt="" loading="lazy" />
                          ) : (
                            <span className="mdish-ph" aria-hidden="true">
                              {i.name.trim().charAt(0).toUpperCase()}
                            </span>
                          )}
                        </Link>
                        <div className="mdish-info">
                          <Link href={`/admin/menu/${i.id}`} className="mdish-name">
                            {i.name}
                          </Link>
                          <ul className="mdish-meta">
                            <li>{i.variants.length ? `${i.variants.length} sizes` : 'Single price'}</li>
                            {i.modifierGroups.length > 0 && <li>{i.modifierGroups.length} option {i.modifierGroups.length === 1 ? 'group' : 'groups'}</li>}
                            <li>{i.prepMinutes} min prep</li>
                            {!i.imageUrl && <li className="warn">No photo</li>}
                          </ul>
                        </div>
                        <div className="mdish-badges">
                          {i.isArchived ? <Badge tone="neutral">Archived</Badge> : i.isAvailable ? <Badge tone="ok">Available</Badge> : <Badge tone="danger">Sold out</Badge>}
                          {i.isDemo && <Badge tone="warn">Demo</Badge>}
                        </div>
                        <span className="mdish-price">{i.variants.length ? formatGHS(Math.min(...i.variants.map((v) => v.pricePesewas))) : formatGHS(i.basePricePesewas)}</span>
                        <div className="mdish-actions">
                          {!i.isArchived && <ActionButton className="btn sm" action={availabilityAction.bind(null, i.id, !i.isAvailable)}>{i.isAvailable ? 'Sold out' : 'Available'}</ActionButton>}
                          <ActionButton className="btn sm ghost" action={archiveAction.bind(null, i.id, !i.isArchived)} confirm={i.isArchived ? undefined : `Archive ${i.name}? It disappears from the menu but stays in order history.`}>
                            {i.isArchived ? 'Restore' : 'Archive'}
                          </ActionButton>
                          <Link href={`/admin/menu/${i.id}`} className="btn sm primary">
                            Edit
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <aside className="menu-side">
          <section className="panel menu-side-card">
            <h2>Add a category</h2>
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
              <label className="check check-card">
                <input type="checkbox" name="isActive" defaultChecked />
                <span>
                  Visible on the menu
                  <span className="hint" style={{ display: 'block' }}>Untick to hide the whole category.</span>
                </span>
              </label>
              <SubmitButton>Add category</SubmitButton>
            </ActionForm>
          </section>
          {categories.length > 0 && (
            <section className="panel menu-side-card">
              <h2>Edit categories</h2>
              {categories.map((c) => (
                <details key={c.id} className="menu-edit">
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
