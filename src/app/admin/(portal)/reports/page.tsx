import { requirePagePerm } from '@/server/auth/current';
import { reports, METRIC_DEFINITIONS } from '@/server/reporting';
import { getSettings } from '@/server/settings';
import { resolvePeriod } from '@/server/period';
import { formatGHS } from '@/lib/money';
import { formatLocalDate } from '@/lib/time';
import { PeriodPicker } from '@/components/admin/PeriodPicker';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reports' };

const pct = (v: number | null) => (v == null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

function Bars({ rows, label, value, fmt = String }: { rows: Record<string, unknown>[]; label: string; value: string; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[value]) || 0));
  return (
    <div className="rep-bars">
      {rows.map((r, i) => (
        <div key={i} className="rep-bar-row">
          <span className="small">{String(r[label])}</span>
          <div className="bar" aria-hidden="true"><span style={{ width: `${((Number(r[value]) || 0) / max) * 100}%` }} /></div>
          <span className="small tnum rep-bar-val">{fmt(Number(r[value]) || 0)}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rep-stat">
      <span className="rep-stat-l">{label}</span>
      <strong className="tnum">{value}</strong>
      {note && <span className="small muted">{note}</span>}
    </div>
  );
}

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePagePerm('reports.view', '/admin/login');
  const tz = (await getSettings('restaurant')).timezone;
  const p = resolvePeriod(await searchParams, tz, 30);
  const r = await reports(user, p.from, p.to);
  const empty = r.daily.length === 0;
  const range = `${formatLocalDate(p.from, tz)} to ${formatLocalDate(new Date(p.to.getTime() - 1), tz)}`;
  const totalSales = r.daily.reduce((a, d) => a + (Number(d.paidSales) || 0), 0);
  const totalOrders = r.byFulfillment.reduce((a, f) => a + (Number(f.orders) || 0), 0);
  return (
    <>
      <div className="admin-top">
        <div>
          <h1>Reports</h1>
          <p className="muted" style={{ margin: 0 }}>{range}</p>
        </div>
      </div>
      <PeriodPicker {...p} />
      {empty ? (
        <div className="empty-box">
          <h3>No orders in this period</h3>
          <p>Reports fill in as real (non-test) orders come through. Try a wider date range.</p>
        </div>
      ) : (
        <>
          <div className="kpis ov-kpis fin-kpis">
            <div className="kpi"><div className="v">{formatGHS(totalSales)}</div><div className="l">Paid sales</div></div>
            <div className="kpi"><div className="v">{totalOrders}</div><div className="l">Orders</div></div>
            <div className="kpi"><div className="v">{pct(r.rates.cancellationRate)}</div><div className="l">Cancellation rate</div></div>
            <div className="kpi"><div className="v">{pct(r.prep.onTimeRate)}</div><div className="l">Ready on time</div></div>
          </div>
          <section className="panel rep-panel">
            <div className="dsp-head"><h2>Paid sales by day</h2></div>
            <Bars rows={r.daily} label="day" value="paidSales" fmt={formatGHS} />
            <p className="hint">Order value of orders placed that day whose payment is confirmed (before refunds).</p>
          </section>
          <div className="grid-2 rep-grid">
            <section className="panel rep-panel">
              <div className="dsp-head"><h2>Orders by hour</h2><span className="muted small">{tz}</span></div>
              <Bars rows={r.peakHours.map((h) => ({ ...h, label: `${String(h.hour).padStart(2, '0')}:00` }))} label="label" value="orders" />
            </section>
            <section className="panel rep-panel">
              <div className="dsp-head"><h2>Best sellers</h2></div>
              {r.bestSellers.length === 0 ? <p className="dsp-empty">No dishes sold yet.</p> : (
                <div className="table-wrap">
                  <table className="data cases-table"><thead><tr><th>Dish</th><th className="num">Qty</th><th className="num">Revenue</th></tr></thead><tbody>{r.bestSellers.map((b) => <tr key={b.name}><td>{b.name}</td><td className="num">{b.qty}</td><td className="num">{formatGHS(b.revenue)}</td></tr>)}</tbody></table>
                </div>
              )}
            </section>
          </div>
          <section className="panel rep-panel">
            <div className="dsp-head"><h2>Operations</h2></div>
            <div className="zone-groups">
              <div className="set-group">
                <div className="set-label">Orders</div>
                <div className="rep-stats">
                  {r.byFulfillment.map((f) => <Stat key={f.fulfillmentType} label={f.fulfillmentType === 'pickup' ? 'Pickup orders' : 'Delivery orders'} value={String(f.orders)} note={formatGHS(f.value)} />)}
                  <Stat label="Cancellation rate" value={pct(r.rates.cancellationRate)} note={METRIC_DEFINITIONS.cancellationRate} />
                  <Stat label="Orders with a refund" value={pct(r.rates.refundRate)} />
                </div>
              </div>
              <div className="set-group">
                <div className="set-label">Kitchen</div>
                <div className="rep-stats">
                  <Stat label="Average preparation time" value={r.prep.avgPrepMinutes != null ? `${r.prep.avgPrepMinutes} min` : 'n/a'} />
                  <Stat label="Ready on time" value={pct(r.prep.onTimeRate)} note={METRIC_DEFINITIONS.onTimeRate} />
                </div>
              </div>
              <div className="set-group">
                <div className="set-label">Delivery</div>
                <div className="rep-stats">
                  <Stat label="Deliveries completed" value={`${r.delivery.delivered} of ${r.delivery.deliveries}`} />
                  <Stat label="Failed at least once" value={String(r.delivery.failed)} />
                  <Stat label="Pickup to door (average)" value={r.delivery.avgDeliveryMinutes != null ? `${r.delivery.avgDeliveryMinutes} min` : 'n/a'} />
                </div>
              </div>
              <div className="set-group">
                <div className="set-label">Customers</div>
                <div className="rep-stats">
                  <Stat label="Repeat customers" value={`${r.repeat.repeatCustomers} of ${r.repeat.customers}`} note="Ordered more than once in this period (by phone number)" />
                </div>
              </div>
            </div>
          </section>
          {(r.riders.length > 0 || r.wastage.length > 0) && (
            <div className="grid-2 rep-grid">
              {r.riders.length > 0 && (
                <section className="panel rep-panel">
                  <div className="dsp-head"><h2>Riders</h2><span className="dsp-count">{r.riders.length}</span></div>
                  <div className="table-wrap">
                    <table className="data cases-table"><thead><tr><th>Rider</th><th className="num">Delivered</th><th className="num">Failed</th><th className="num">Declined</th><th className="num">Avg min</th></tr></thead><tbody>{r.riders.map((x) => <tr key={x.riderName}><td>{x.riderName}</td><td className="num">{x.completed}</td><td className="num">{x.failed}</td><td className="num">{x.declined}</td><td className="num">{x.avgMinutes ?? ''}</td></tr>)}</tbody></table>
                  </div>
                </section>
              )}
              {r.wastage.length > 0 && (
                <section className="panel rep-panel">
                  <div className="dsp-head"><h2>Recorded wastage</h2></div>
                  <div className="table-wrap">
                    <table className="data cases-table"><tbody>{r.wastage.map((w) => <tr key={w.name}><td>{w.name}</td><td className="num">{Number(w.wasted)} {w.unit}</td></tr>)}</tbody></table>
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
