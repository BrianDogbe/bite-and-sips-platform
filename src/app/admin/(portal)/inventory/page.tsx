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

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inventory' };

export default async function InventoryPage() {
  await requirePagePerm('inventory.manage', '/admin/login');
  const [stock, inv, suppliers, r] = await Promise.all([listStock(), getSettings('inventory'), sql<{ id: number; name: string; phone: string | null }[]>`select id, name, phone from suppliers order by name`, getSettings('restaurant')]);
  return (
    <>
      <div className="admin-top">
        <h1>Inventory</h1>
        <Badge tone={inv.autoDeductOnPrep ? 'ok' : 'neutral'}>Automatic recipe deduction {inv.autoDeductOnPrep ? 'on' : 'off'}</Badge>
      </div>
      <p className="alert info small">
        Quantities shown are <strong>recorded</strong> amounts calculated from receipts, wastage, adjustments and (if enabled) recipe deductions. They drift from reality over time. Do a physical count regularly and record it as a “Count” to reconcile.
      </p>
      <div className="two-col">
        <section className="panel">
          {stock.length === 0 ? (
            <div className="empty">
              <h3>No stock items yet</h3>
              <p>Add ingredients and supplies you want to track, like rice, oil, chicken or bottled drinks.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
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
        <aside className="stack" style={{ ['--stack' as string]: '18px' }}>
          <section className="panel">
            <h2 style={{ fontSize: '1.15rem' }}>Add stock item</h2>
            <ActionForm action={createStockAction} className="stack" resetOnSuccess>
              <div className="field"><label htmlFor="s-n">Name</label><input id="s-n" name="name" className="input" required maxLength={80} /></div>
              <div className="grid-2">
                <div className="field"><label htmlFor="s-u">Unit</label><select id="s-u" name="unit" className="select">{UNITS.map((u) => <option key={u}>{u}</option>)}</select></div>
                <div className="field"><label htmlFor="s-r">Reorder level</label><input id="s-r" name="reorderLevel" type="number" step="0.001" min="0" className="input" defaultValue={0} /></div>
                <div className="field"><label htmlFor="s-c">Cost per unit (GH₵)</label><input id="s-c" name="cost" className="input" inputMode="decimal" /></div>
                <div className="field"><label htmlFor="s-s">Supplier</label><select id="s-s" name="supplierId" className="select"><option value="">None</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              </div>
              <label className="check small"><input type="checkbox" name="allowNegative" /> Allow recorded stock below zero (not recommended)</label>
              <SubmitButton>Add item</SubmitButton>
            </ActionForm>
          </section>
          <section className="panel">
            <h2 style={{ fontSize: '1.15rem' }}>Suppliers</h2>
            <ul style={{ paddingLeft: 18 }}>{suppliers.map((s) => <li key={s.id}>{s.name}{s.phone ? ` (${s.phone})` : ''}</li>)}</ul>
            <ActionForm action={supplierAction} className="stack" resetOnSuccess>
              <input name="name" className="input" placeholder="Supplier name" required aria-label="Supplier name" />
              <input name="phone" className="input" placeholder="Phone" aria-label="Phone" />
              <SubmitButton className="btn sm">Add supplier</SubmitButton>
            </ActionForm>
          </section>
        </aside>
      </div>
    </>
  );
}
