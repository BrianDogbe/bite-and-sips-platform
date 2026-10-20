import Link from 'next/link';
import { requirePagePerm } from '@/server/auth/current';
import { loadMenu } from '@/server/menu';
import { formatGHS } from '@/lib/money';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { ActionButton } from '@/components/ActionButton';
import { Badge } from '@/components/Badge';
import { categoryAction, availabilityAction, archiveAction, deleteCategoryAction } from './actions';
import { C_ADMIN_TOP, C_CHECK_CARD, C_DSP_COUNT, C_DSP_EMPTY, C_MENU_LAYOUT, C_MENU_SIDE, C_MENU_SIDE_CARD, C_TWO_COL } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Menu' };

export default async function MenuAdmin({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  await requirePagePerm('menu.manage', '/admin/login');
  const sp = await searchParams;
  const { categories, items } = await loadMenu({ includeArchived: sp.archived === '1', includeInactiveCategories: true });
  const demoCount = items.filter((i) => i.isDemo && !i.isArchived).length;
  return (
    <>
      <div className={`${C_ADMIN_TOP} admin-top`}>
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
      <div className={`${C_TWO_COL} ${C_MENU_LAYOUT}`}>
        <div className="grid [gap:32px]">
          {categories.length === 0 && (
            <div className="empty panel">
              <h3>Start with a category</h3>
              <p>For example “Rice dishes”, “Grills” or “Drinks”. Then add dishes to it.</p>
            </div>
          )}
          {categories.map((c) => {
            const list = items.filter((i) => i.categoryId === c.id);
            return (
              <section key={c.id} className="panel [padding:clamp(22px,_2.4vw,_34px)]">
                <div className="flex items-center justify-between [gap:12px] [margin-bottom:16px] [padding-bottom:14px] [border-bottom:1px_solid_var(--line,_var(--border))] [&_h2]:m-0 [&_h2]:[font-size:1.2rem] [&_h2]:flex [&_h2]:items-center [&_h2]:flex-wrap [&_h2]:[gap:10px]">
                  <h2>
                    {c.name} <span className={C_DSP_COUNT}>{list.length}</span> {!c.isActive && <Badge tone="neutral">Hidden</Badge>} {c.isDemo && <Badge tone="warn">Demo</Badge>}
                  </h2>
                  {list.length === 0 && <ActionButton className="btn sm ghost" action={deleteCategoryAction.bind(null, c.id)} confirm="Delete this empty category?">Delete</ActionButton>}
                </div>
                {list.length === 0 ? (
                  <p className={C_DSP_EMPTY}>No dishes yet.</p>
                ) : (
                  <div className="grid [gap:0] [border:1px_solid_var(--line,_var(--border))] [border-radius:14px] overflow-hidden [background:var(--surface,_#fff)]">
                    {list.map((i) => (
                      <article key={i.id} className={`grid [gap:20px] [grid-template-columns:88px_minmax(0,_1fr)_auto] [grid-template-areas:'img_info_price'_'img_badges_actions'] items-center [&]:[column-gap:28px] [&]:[row-gap:18px] [padding:30px_28px] [.mdish_+_&]:[border-top:1px_solid_var(--line,_var(--border))] [&.archived]:[opacity:0.65] max-[900px]:[grid-template-columns:72px_minmax(0,_1fr)] max-[900px]:[grid-template-areas:'img_info'_'img_price'_'badges_badges'_'actions_actions'] max-[900px]:[padding:24px_20px] max-[900px]:[column-gap:18px] mdish${i.isArchived ? ' archived' : ''}`}>
                        <Link href={`/admin/menu/${i.id}`} className="block [border-radius:12px] [background:var(--ivory-2,_#efe8d9)] overflow-hidden [grid-area:img] [align-self:start] [width:88px] [height:88px] [&_img]:[width:100%] [&_img]:[height:100%] [&_img]:object-cover [&_img]:block max-[900px]:[width:72px] max-[900px]:[height:72px]" aria-label={`Edit ${i.name}`}>
                          {i.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={i.imageUrl} alt="" loading="lazy" />
                          ) : (
                            <span className="grid place-items-center [width:100%] [height:100%] [font-family:var(--font-display)] [font-size:1.8rem] [color:var(--espresso)] [background:linear-gradient(135deg,_var(--ivory-2,_#efe8d9),_var(--caramel-tint,_#f6ead9))]" aria-hidden="true">
                              {i.name.trim().charAt(0).toUpperCase()}
                            </span>
                          )}
                        </Link>
                        <div className="grid [min-width:0] [grid-area:info] [gap:8px]">
                          <Link href={`/admin/menu/${i.id}`} className="font-extrabold no-underline [color:var(--ink,_inherit)] [font-size:1.15rem]">
                            {i.name}
                          </Link>
                          <ul className="list-none m-0 p-0 flex flex-wrap [color:var(--muted)] [font-size:0.9rem] [gap:6px_14px] [&_li_+_li::before]:[content:'·'] [&_li_+_li::before]:[margin-right:12px] [&_.warn]:[color:var(--warn,_#9a5b00)] [&_.warn]:font-bold">
                            <li>{i.variants.length ? `${i.variants.length} sizes` : 'Single price'}</li>
                            {i.modifierGroups.length > 0 && <li>{i.modifierGroups.length} option {i.modifierGroups.length === 1 ? 'group' : 'groups'}</li>}
                            <li>{i.prepMinutes} min prep</li>
                            {!i.imageUrl && <li className="warn">No photo</li>}
                          </ul>
                        </div>
                        <div className="flex flex-wrap [grid-area:badges] justify-start [gap:10px] max-[1250px]:[grid-column:2] max-[1250px]:[grid-row:2] max-[560px]:[grid-column:1_/_-1] max-[560px]:[grid-row:auto]">
                          {i.isArchived ? <Badge tone="neutral">Archived</Badge> : i.isAvailable ? <Badge tone="ok">Available</Badge> : <Badge tone="danger">Sold out</Badge>}
                          {i.isDemo && <Badge tone="warn">Demo</Badge>}
                        </div>
                        <span className="font-extrabold whitespace-nowrap text-right [min-width:96px] tabular-nums [grid-area:price] [align-self:start] [font-size:1.1rem] max-[1250px]:[grid-column:3] max-[1250px]:[grid-row:1] max-[560px]:[grid-column:2] max-[560px]:[grid-row:auto] max-[900px]:text-left">{i.variants.length ? formatGHS(Math.min(...i.variants.map((v) => v.pricePesewas))) : formatGHS(i.basePricePesewas)}</span>
                        <div className="flex justify-end [grid-area:actions] [gap:12px] max-[1250px]:[grid-column:2_/_-1] max-[1250px]:[grid-row:3] max-[1250px]:justify-start max-[560px]:[grid-column:1_/_-1] max-[560px]:[grid-row:auto] max-[900px]:justify-start">
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
        <aside className={C_MENU_SIDE}>
          <section className={`panel ${C_MENU_SIDE_CARD} menu-side-card`}>
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
              <label className={`check ${C_CHECK_CARD}`}>
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
            <section className={`panel ${C_MENU_SIDE_CARD} menu-side-card`}>
              <h2>Edit categories</h2>
              {categories.map((c) => (
                <details key={c.id} className="[border:1px_solid_var(--line,_var(--border))] [border-radius:12px] [padding:0_16px] [margin-bottom:10px] [&_>_summary]:[padding:14px_0] [&_>_summary]:font-bold [&_>_summary]:cursor-pointer [&[open]_>_summary]:[border-bottom:1px_solid_var(--line,_var(--border))] [&[open]_>_summary]:[margin-bottom:14px] [&_.stack]:[padding-bottom:16px]">
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
