import Link from 'next/link';
import { requirePagePerm } from '@/server/auth/current';
import { listOrders } from '@/server/orders/queries';
import { getSettings } from '@/server/settings';
import { periodToUtc } from '@/server/reporting';
import { formatGHS } from '@/lib/money';
import { formatLocalDateTime, localDateKey } from '@/lib/time';
import { ORDER_STATUSES, PAYMENT_STATUSES } from '@/lib/states';
import { Badge } from '@/components/Badge';
import { labelOrder, labelPayment, labelKitchen, labelFulfillment, orderTone, paymentTone, kitchenTone, fulfillmentTone } from '@/lib/status-ui';
import { LiveRefresh } from '@/components/admin/LiveRefresh';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Orders' };

type SP = { q?: string; status?: string; payment?: string; type?: string; attention?: string; from?: string; to?: string; test?: string; page?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePagePerm('orders.view', '/admin/login');
  const sp = await searchParams;
  const tz = (await getSettings('restaurant')).timezone;
  let from: Date | null = null;
  let to: Date | null = null;
  if (sp.from || sp.to) {
    const r = periodToUtc(sp.from || sp.to!, sp.to || sp.from!, tz);
    from = r.from;
    to = r.to;
  }
  const page = Math.max(1, Number(sp.page) || 1);
  const rows = await listOrders(user, {
    q: sp.q,
    status: ORDER_STATUSES.includes(sp.status as never) ? sp.status : undefined,
    paymentStatus: PAYMENT_STATUSES.includes(sp.payment as never) ? sp.payment : undefined,
    fulfillmentType: sp.type === 'pickup' || sp.type === 'delivery' ? sp.type : undefined,
    attention: sp.attention === '1',
    from,
    to,
    includeTest: sp.test !== '0',
    limit: 50,
    offset: (page - 1) * 50,
  });
  const qs = (p: number) => new URLSearchParams({ ...(sp as Record<string, string>), page: String(p) }).toString();
  const today = localDateKey(new Date(), tz);
  return (
    <>
      <div className="admin-top">
        <h1>Orders</h1>
        <LiveRefresh topics={['admin']} />
      </div>
      <form className="filters panel tight" method="get">
        <div className="field grow">
          <label htmlFor="q">Search</label>
          <input id="q" name="q" className="input" defaultValue={sp.q} placeholder="Order number, name or phone" />
        </div>
        <div className="field">
          <label htmlFor="status">Order status</label>
          <select id="status" name="status" className="select" defaultValue={sp.status ?? ''}>
            <option value="">Any</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {labelOrder(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="payment">Payment</label>
          <select id="payment" name="payment" className="select" defaultValue={sp.payment ?? ''}>
            <option value="">Any</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {labelPayment(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="type">Type</label>
          <select id="type" name="type" className="select" defaultValue={sp.type ?? ''}>
            <option value="">Any</option>
            <option value="pickup">Pickup</option>
            <option value="delivery">Delivery</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="from">From</label>
          <input id="from" type="date" name="from" className="input" defaultValue={sp.from} max={today} />
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <input id="to" type="date" name="to" className="input" defaultValue={sp.to} max={today} />
        </div>
        <label className="check" style={{ alignSelf: 'center' }}>
          <input type="checkbox" name="attention" value="1" defaultChecked={sp.attention === '1'} /> Needs attention
        </label>
        <label className="check" style={{ alignSelf: 'center' }}>
          <input type="checkbox" name="test" value="0" defaultChecked={sp.test === '0'} /> Hide test orders
        </label>
        <button className="btn leaf">Apply</button>
        <Link href="/admin/orders" className="btn ghost">
          Reset
        </Link>
      </form>
      {rows.length === 0 ? (
        <div className="empty panel">
          <h3>No orders match</h3>
          <p>New orders appear here as soon as customers place them.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Order</th>
                <th>Payment</th>
                <th>Kitchen</th>
                <th>Fulfilment</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className={o.needsAttention ? 'attention' : undefined}>
                  <td>
                    <Link href={`/admin/orders/${o.id}`} style={{ fontWeight: 700 }} className="tnum">
                      {o.orderNumber}
                    </Link>
                    {o.isTest && <span className="badge neutral plain" style={{ marginLeft: 6 }}>test</span>}
                    <div className="small muted">{formatLocalDateTime(o.createdAt, tz)}</div>
                    {o.needsAttention && <div className="small" style={{ color: 'var(--danger)', fontWeight: 700 }}>{o.attentionReason}</div>}
                  </td>
                  <td>
                    {o.customerName}
                    <div className="small muted">{o.customerPhone}</div>
                  </td>
                  <td>
                    {o.fulfillmentType === 'pickup' ? 'Pickup' : 'Delivery'}
                    <div className="small muted">due {formatLocalDateTime(o.promisedAt, tz)}</div>
                  </td>
                  <td>
                    <Badge tone={orderTone(o.status)}>{labelOrder(o.status)}</Badge>
                  </td>
                  <td>
                    <Badge tone={paymentTone(o.paymentStatus)}>{labelPayment(o.paymentStatus)}</Badge>
                  </td>
                  <td>
                    <Badge tone={kitchenTone(o.kitchenStatus)}>{labelKitchen(o.kitchenStatus)}</Badge>
                  </td>
                  <td>
                    <Badge tone={fulfillmentTone(o.fulfillmentStatus)}>{labelFulfillment(o.fulfillmentStatus)}</Badge>
                  </td>
                  <td className="num">{formatGHS(o.totalPesewas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        {page > 1 && (
          <Link className="btn sm" href={`?${qs(page - 1)}`}>
            Previous
          </Link>
        )}
        {rows.length === 50 && (
          <Link className="btn sm" href={`?${qs(page + 1)}`}>
            Next
          </Link>
        )}
        {user.permissions.has('reports.view') && (
          <a className="btn sm ghost" href={`/api/admin/export?type=orders&from=${sp.from ?? ''}&to=${sp.to ?? ''}`}>
            Export CSV
          </a>
        )}
      </div>
    </>
  );
}
