import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePerm } from '@/server/auth/current';
import { movementsFor } from '@/server/inventory';
import { getSettings } from '@/server/settings';
import { sql } from '@/server/db';
import { formatLocalDateTime } from '@/lib/time';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { movementAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Stock item' };

export default async function StockItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePerm('inventory.manage', '/admin/login');
  const id = Number((await params).id);
  const [item] = await sql<{ id: number; name: string; unit: string; quantity: string; reorderLevel: string }[]>`select id, name, unit, quantity, reorder_level from stock_items where id = ${Number.isInteger(id) ? id : 0}`;
  if (!item) notFound();
  const [moves, r, suppliers] = await Promise.all([movementsFor(item.id), getSettings('restaurant'), sql<{ id: number; name: string }[]>`select id, name from suppliers order by name`]);
  return (
    <>
      <div className="admin-top">
        <div>
          <p className="muted" style={{ margin: 0 }}><Link href="/admin/inventory">Inventory</Link></p>
          <h1>{item.name}</h1>
          <p className="muted" style={{ margin: 0 }}>Recorded: {Number(item.quantity)} {item.unit}. Reorder at {Number(item.reorderLevel)}.</p>
        </div>
      </div>
      <div className="two-col">
        <section className="panel">
          <h2 style={{ fontSize: '1.15rem' }}>Movement history</h2>
          {moves.length === 0 ? <p className="muted">No movements yet.</p> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>When</th><th>Type</th><th className="num">Change</th><th className="num">After</th><th>Reason</th></tr></thead>
                <tbody>
                  {moves.map((m) => (
                    <tr key={m.id}>
                      <td className="small">{formatLocalDateTime(m.createdAt, r.timezone)}<div className="muted">{m.byName ?? 'system'}</div></td>
                      <td>{m.kind}</td>
                      <td className="num">{Number(m.quantityDelta) > 0 ? '+' : ''}{Number(m.quantityDelta)}</td>
                      <td className="num">{Number(m.quantityAfter)}</td>
                      <td className="small">{m.reason}{m.orderId && <> <Link href={`/admin/orders/${m.orderId}`}>order</Link></>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel">
          <h2 style={{ fontSize: '1.15rem' }}>Record a movement</h2>
          <ActionForm action={movementAction.bind(null, item.id)} className="stack" resetOnSuccess>
            <div className="field">
              <label htmlFor="m-k">Type</label>
              <select id="m-k" name="kind" className="select">
                <option value="receipt">Delivery received (adds stock)</option>
                <option value="wastage">Wastage / spoiled (removes stock)</option>
                <option value="count">Physical count (sets recorded quantity)</option>
                <option value="adjustment">Correction (+ or −)</option>
                <option value="sale_reversal">Return unused ingredients from a cancelled order</option>
              </select>
            </div>
            <div className="field"><label htmlFor="m-q">Quantity ({item.unit})</label><input id="m-q" name="quantity" type="number" step="0.001" className="input" required /></div>
            <div className="grid-2">
              <div className="field"><label htmlFor="m-c">Unit cost (GH₵, receipts)</label><input id="m-c" name="cost" className="input" inputMode="decimal" /></div>
              <div className="field"><label htmlFor="m-s">Supplier (receipts)</label><select id="m-s" name="supplierId" className="select"><option value="">None</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            </div>
            <div className="field"><label htmlFor="m-r">Reason / note</label><input id="m-r" name="reason" className="input" maxLength={300} placeholder="Required for wastage and corrections" /></div>
            <SubmitButton>Record</SubmitButton>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
