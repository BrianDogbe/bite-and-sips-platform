import Link from 'next/link';
import { requirePagePerm } from '@/server/auth/current';
import { listStock, UNITS } from '@/server/inventory';
import { getSettings } from '@/server/settings';
import { sql } from '@/server/db';
import { formatGHS } from '@/lib/money';
import { formatLocalDate } from '@/lib/time';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { Badge } from '@/components/Badge';
import { createStockAction, supplierAction } from './actions';
import { C_ADMIN_TOP, C_CASES_TABLE, C_CHECK_CARD, C_DSP_COUNT, C_DSP_EMPTY, C_DSP_HEAD, C_EMPTY_BOX, C_FORM_ALIGNED, C_MENU_SIDE, C_MENU_SIDE_CARD, C_SET_GROUP, C_SET_LABEL, C_TWO_COL, C_ZONES_LAYOUT, C_ZONE_GROUPS } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inventory' };

export default async function InventoryPage() {
  await requirePagePerm('inventory.manage', '/admin/login');
  const [stock, inv, suppliers, r] = await Promise.all([listStock(), getSettings('inventory'), sql<{ id: number; name: string; phone: string | null }[]>`select id, name, phone from suppliers order by name`, getSettings('restaurant')]);
  return (
    <>
      <div className={`${C_ADMIN_TOP} admin-top`}>
        <div>
          <h1>Inventory</h1>
          <p className="muted" style={{ margin: 0 }}>{stock.length} stock {stock.length === 1 ? 'item' : 'items'} tracked</p>
        </div>
        <Badge tone={inv.autoDeductOnPrep ? 'ok' : 'neutral'}>Automatic recipe deduction {inv.autoDeductOnPrep ? 'on' : 'off'}</Badge>
      </div>
      <p className="alert info small" style={{ marginBottom: 28 }}>
        Quantities shown are <strong>recorded</strong> amounts calculated from receipts, wastage, adjustments and (if enabled) recipe deductions. They drift from reality over time. Do a physical count regularly and record it as a “Count” to reconcile.
      </p>
      <div className={`${C_TWO_COL} ${C_ZONES_LAYOUT}`}>
        <section className="panel">
          <h2 className={C_DSP_HEAD}>
            Stock <span className={C_DSP_COUNT}>{stock.length}</span>
          </h2>
          {stock.length === 0 ? (
            <div className={`empty ${C_EMPTY_BOX}`}>
              <h3>No stock items yet</h3>
              <p>Add ingredients and supplies you want to track, like rice, oil, chicken or bottled drinks.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className={`data ${C_CASES_TABLE}`}>
                <thead>
                  <tr><th>Item</th><th className="num">Recorded qty</th><th className="num">Reorder at</th><th className="num">Unit cost</th><th>Last count</th></tr>
                </thead>
                <tbody>
                  {stock.map((s) => (
                    <tr key={s.id} className={s.isLow ? 'attention' : undefined}>
                      <td><Link href={`/admin/inventory/${s.id}`} style={{ fontWeight: 700 }}>{s.name}</Link>{s.supplierName && <div className="small muted">{s.supplierName}</div>}</td>
                      <td className="num">{Number(s.quantity)} {s.unit} {s.isLow && <Badge tone="danger">Low</Badge>}</td>
                      <td className="num">{Number(s.reorderLevel)}</td>
                      <td className="num">{s.costPerUnitPesewas != null ? formatGHS(s.costPerUnitPesewas) : 'n/a'}</td>
                      <td className="small">{s.lastCountedAt ? formatLocalDate(s.lastCountedAt, r.timezone) : 'Never counted'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <aside className={C_MENU_SIDE}>
          <section className={`panel ${C_MENU_SIDE_CARD} menu-side-card`}>
            <h2>Add stock item</h2>
            <ActionForm action={createStockAction} className="stack" resetOnSuccess>
              <div className={`${C_ZONE_GROUPS} zone-groups`}>
                <div className={`${C_SET_GROUP} set-group`}>
                  <p className={C_SET_LABEL}>Item</p>
                  <div className={`${C_FORM_ALIGNED} two`}>
                    <div className="field"><label htmlFor="s-n">Name</label><input id="s-n" name="name" className="input" required maxLength={80} /></div>
                    <div className="field"><label htmlFor="s-u">Unit</label><select id="s-u" name="unit" className="select">{UNITS.map((u) => <option key={u}>{u}</option>)}</select></div>
                  </div>
                </div>
                <div className={`${C_SET_GROUP} set-group`}>
                  <p className={C_SET_LABEL}>Stock and cost</p>
                  <div className={`${C_FORM_ALIGNED} two`}>
                    <div className="field"><label htmlFor="s-r">Reorder level</label><input id="s-r" name="reorderLevel" type="number" step="0.001" min="0" className="input" defaultValue={0} /></div>
                    <div className="field"><label htmlFor="s-c">Cost per unit (GH₵)</label><input id="s-c" name="cost" className="input" inputMode="decimal" /></div>
                    <div className="field"><label htmlFor="s-s">Supplier</label><select id="s-s" name="supplierId" className="select"><option value="">None</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                  </div>
                </div>
                <label className={`check ${C_CHECK_CARD}`}>
                  <input type="checkbox" name="allowNegative" />
                  <span>
                    Allow recorded stock below zero
                    <span className="hint" style={{ display: 'block' }}>Not recommended.</span>
                  </span>
                </label>
              </div>
              <SubmitButton className="btn primary">Add item</SubmitButton>
            </ActionForm>
          </section>
          <section className={`panel ${C_MENU_SIDE_CARD} menu-side-card`}>
            <h2>Suppliers</h2>
            {suppliers.length === 0 ? (
              <p className={C_DSP_EMPTY} style={{ marginBottom: 18 }}>No suppliers yet.</p>
            ) : (
              <ul className="list-none [margin:0_0_22px] p-0 [border:1px_solid_var(--line,_var(--border))] [border-radius:12px] [&_li]:flex [&_li]:items-baseline [&_li]:justify-between [&_li]:[gap:12px] [&_li]:[padding:14px_18px] [&_li_+_li]:[border-top:1px_solid_var(--line,_var(--border))]">
                {suppliers.map((s) => (
                  <li key={s.id}>
                    <strong>{s.name}</strong>
                    {s.phone && <span className="muted small">{s.phone}</span>}
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={supplierAction} className="stack" resetOnSuccess>
              <div className={`${C_SET_GROUP} set-group`}>
                <p className={C_SET_LABEL}>Add supplier</p>
                <div className={`${C_FORM_ALIGNED} two`}>
                  <div className="field"><label htmlFor="sp-n">Supplier name</label><input id="sp-n" name="name" className="input" required /></div>
                  <div className="field"><label htmlFor="sp-p">Phone</label><input id="sp-p" name="phone" className="input" /></div>
                </div>
              </div>
              <SubmitButton className="btn">Add supplier</SubmitButton>
            </ActionForm>
          </section>
        </aside>
      </div>
    </>
  );
}
