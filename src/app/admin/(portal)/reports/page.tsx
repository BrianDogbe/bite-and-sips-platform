import { requirePagePerm } from '@/server/auth/current';
import { reports, METRIC_DEFINITIONS } from '@/server/reporting';
import { getSettings } from '@/server/settings';
import { resolvePeriod } from '@/server/period';
import { formatGHS } from '@/lib/money';
import { PeriodPicker } from '@/components/admin/PeriodPicker';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reports' };

const pct = (v: number | null) => (v == null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

function Bars({ rows, label, value, fmt = String }: { rows: Record<string, unknown>[]; label: string; value: string; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[value]) || 0));
  return (
    <div className="stack" style={{ ['--stack' as string]: '6px' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px', gap: 10, alignItems: 'center' }}>
          <span className="small">{String(r[label])}</span>
          <div className="bar" aria-hidden="true"><span style={{ width: `${((Number(r[value]) || 0) / max) * 100}%` }} /></div>
          <span className="small tnum" style={{ textAlign: 'right' }}>{fmt(Number(r[value]) || 0)}</span>
        </div>
      ))}
    </div>
  );
}

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePagePerm('reports.view', '/admin/login');
  const tz = (await getSettings('restaurant')).timezone;
  const p = resolvePeriod(await searchParams, tz, 30);
  const r = await reports(user, p.from, p.to);
  const empty = r.daily.length === 0;
  return (
    <>
      <div className="admin-top"><h1>Reports</h1></div>
      <PeriodPicker {...p} />
      {empty ? (
        <div className="empty panel"><h3>No orders in this period</h3><p>Reports fill in as real (non-test) orders come through.</p></div>
      ) : (
        <div className="grid-2" style={{ gap: 18, alignItems: 'start' }}>
          <section className="panel">
            <h2 style={{ fontSize: '1.1rem' }}>Paid sales by day</h2>
            <Bars rows={r.daily} label="day" value="paidSales" fmt={formatGHS} />
            <p className="hint">Order value of orders placed that day whose payment is confirmed (before refunds).</p>
          </section>
          <section className="panel">
            <h2 style={{ fontSize: '1.1rem' }}>Orders by hour ({tz})</h2>
            <Bars rows={r.peakHours.map((h) => ({ ...h, label: `${String(h.hour).padStart(2, '0')}:00` }))} label="label" value="orders" />
          </section>
          <section className="panel">
            <h2 style={{ fontSize: '1.1rem' }}>Best sellers</h2>
            <table className="data"><thead><tr><th>Dish</th><th className="num">Qty</th><th className="num">Revenue</th></tr></thead><tbody>{r.bestSellers.map((b) => <tr key={b.name}><td>{b.name}</td><td className="num">{b.qty}</td><td className="num">{formatGHS(b.revenue)}</td></tr>)}</tbody></table>
          </section>
          <section className="panel">
            <h2 style={{ fontSize: '1.1rem' }}>Operations</h2>
            <table className="data">
              <tbody>
                {r.byFulfillment.map((f) => <tr key={f.fulfillmentType}><td>{f.fulfillmentType === 'pickup' ? 'Pickup orders' : 'Delivery orders'}</td><td className="num">{f.orders} ({formatGHS(f.value)})</td></tr>)}
                <tr><td>Cancellation rate<div className="small muted">{METRIC_DEFINITIONS.cancellationRate}</div></td><td className="num">{pct(r.rates.cancellationRate)}</td></tr>
                <tr><td>Orders with a refund</td><td className="num">{pct(r.rates.refundRate)}</td></tr>
                <tr><td>Average preparation time</td><td className="num">{r.prep.avgPrepMinutes != null ? `${r.prep.avgPrepMinutes} min` : 'n/a'}</td></tr>
                <tr><td>Ready on time<div className="small muted">{METRIC_DEFINITIONS.onTimeRate}</div></td><td className="num">{pct(r.prep.onTimeRate)}</td></tr>
                <tr><td>Deliveries completed</td><td className="num">{r.delivery.delivered} of {r.delivery.deliveries}</td></tr>
                <tr><td>Deliveries that failed at least once</td><td className="num">{r.delivery.failed}</td></tr>
                <tr><td>Average time from pickup to door</td><td className="num">{r.delivery.avgDeliveryMinutes != null ? `${r.delivery.avgDeliveryMinutes} min` : 'n/a'}</td></tr>
                <tr><td>Repeat customers<div className="small muted">Ordered more than once in this period (by phone number)</div></td><td className="num">{r.repeat.repeatCustomers} of {r.repeat.customers}</td></tr>
              </tbody>
            </table>
          </section>
          {r.riders.length > 0 && (
            <section className="panel">
              <h2 style={{ fontSize: '1.1rem' }}>Riders</h2>
              <table className="data"><thead><tr><th>Rider</th><th className="num">Delivered</th><th className="num">Failed</th><th className="num">Declined</th><th className="num">Avg min</th></tr></thead><tbody>{r.riders.map((x) => <tr key={x.riderName}><td>{x.riderName}</td><td className="num">{x.completed}</td><td className="num">{x.failed}</td><td className="num">{x.declined}</td><td className="num">{x.avgMinutes ?? ''}</td></tr>)}</tbody></table>
            </section>
          )}
          {r.wastage.length > 0 && (
            <section className="panel">
              <h2 style={{ fontSize: '1.1rem' }}>Recorded wastage</h2>
              <table className="data"><tbody>{r.wastage.map((w) => <tr key={w.name}><td>{w.name}</td><td className="num">{Number(w.wasted)} {w.unit}</td></tr>)}</tbody></table>
            </section>
          )}
        </div>
      )}
    </>
  );
}
