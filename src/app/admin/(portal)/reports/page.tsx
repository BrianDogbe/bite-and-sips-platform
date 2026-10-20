import { requirePagePerm } from '@/server/auth/current';
import { reports, METRIC_DEFINITIONS } from '@/server/reporting';
import { getSettings } from '@/server/settings';
import { resolvePeriod } from '@/server/period';
import { formatGHS } from '@/lib/money';
import { formatLocalDate } from '@/lib/time';
import { PeriodPicker } from '@/components/admin/PeriodPicker';
import { C_ADMIN_TOP, C_CASES_TABLE, C_DSP_COUNT, C_DSP_EMPTY, C_DSP_HEAD, C_EMPTY_BOX, C_KPI, C_REP_PANEL, C_REP_STATS, C_SET_GROUP, C_SET_LABEL, C_ZONE_GROUPS } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reports' };

const pct = (v: number | null) => (v == null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

function Bars({ rows, label, value, fmt = String }: { rows: Record<string, unknown>[]; label: string; value: string; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[value]) || 0));
  return (
    <div className="grid [gap:12px]">
      {rows.map((r, i) => (
        <div key={i} className="grid [grid-template-columns:96px_1fr_96px] [gap:14px] items-center max-[700px]:[grid-template-columns:70px_1fr_80px] max-[700px]:[gap:8px]">
          <span className="small">{String(r[label])}</span>
          <div className="[height:10px] [background:var(--leaf-3)] rounded-full overflow-hidden [&_>_span]:block [&_>_span]:[height:100%] [&_>_span]:[background:var(--leaf)]" aria-hidden="true"><span style={{ width: `${((Number(r[value]) || 0) / max) * 100}%` }} /></div>
          <span className="small tnum text-right">{fmt(Number(r[value]) || 0)}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="grid [gap:4px] [padding:16px_18px] [border:1px_solid_var(--line)] [border-radius:var(--r-md)] [background:var(--ivory-2)] [&_strong]:[font-size:1.4rem]">
      <span className="font-bold [font-size:0.9rem]">{label}</span>
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
      <div className={`${C_ADMIN_TOP} admin-top`}>
        <div>
          <h1>Reports</h1>
          <p className="muted" style={{ margin: 0 }}>{range}</p>
        </div>
      </div>
      <PeriodPicker {...p} />
      {empty ? (
        <div className={C_EMPTY_BOX}>
          <h3>No orders in this period</h3>
          <p>Reports fill in as real (non-test) orders come through. Try a wider date range.</p>
        </div>
      ) : (
        <>
          <div className="grid [grid-template-columns:repeat(auto-fit,_minmax(170px,_1fr))] [gap:12px] [grid-template-columns:repeat(4,_minmax(0,_1fr))] [gap:16px] max-[1100px]:[grid-template-columns:repeat(2,_minmax(0,_1fr))] ov-kpis [margin-bottom:28px]">
            <div className={C_KPI}><div className="v">{formatGHS(totalSales)}</div><div className="l">Paid sales</div></div>
            <div className={C_KPI}><div className="v">{totalOrders}</div><div className="l">Orders</div></div>
            <div className={C_KPI}><div className="v">{pct(r.rates.cancellationRate)}</div><div className="l">Cancellation rate</div></div>
            <div className={C_KPI}><div className="v">{pct(r.prep.onTimeRate)}</div><div className="l">Ready on time</div></div>
          </div>
          <section className={`panel ${C_REP_PANEL}`}>
            <div className={C_DSP_HEAD}><h2>Paid sales by day</h2></div>
            <Bars rows={r.daily} label="day" value="paidSales" fmt={formatGHS} />
            <p className="hint">Order value of orders placed that day whose payment is confirmed (before refunds).</p>
          </section>
          <div className="grid-2 [gap:24px] [align-items:start] [margin-bottom:24px] [.rep-grid_+_&]:[margin-top:24px] rep-grid">
            <section className={`panel ${C_REP_PANEL}`}>
              <div className={C_DSP_HEAD}><h2>Orders by hour</h2><span className="muted small">{tz}</span></div>
              <Bars rows={r.peakHours.map((h) => ({ ...h, label: `${String(h.hour).padStart(2, '0')}:00` }))} label="label" value="orders" />
            </section>
            <section className={`panel ${C_REP_PANEL}`}>
              <div className={C_DSP_HEAD}><h2>Best sellers</h2></div>
              {r.bestSellers.length === 0 ? <p className={C_DSP_EMPTY}>No dishes sold yet.</p> : (
                <div className="table-wrap">
                  <table className={`data ${C_CASES_TABLE}`}><thead><tr><th>Dish</th><th className="num">Qty</th><th className="num">Revenue</th></tr></thead><tbody>{r.bestSellers.map((b) => <tr key={b.name}><td>{b.name}</td><td className="num">{b.qty}</td><td className="num">{formatGHS(b.revenue)}</td></tr>)}</tbody></table>
                </div>
              )}
            </section>
          </div>
          <section className={`panel ${C_REP_PANEL}`}>
            <div className={C_DSP_HEAD}><h2>Operations</h2></div>
            <div className={`${C_ZONE_GROUPS} zone-groups`}>
              <div className={`${C_SET_GROUP} set-group`}>
                <div className={C_SET_LABEL}>Orders</div>
                <div className={C_REP_STATS}>
                  {r.byFulfillment.map((f) => <Stat key={f.fulfillmentType} label={f.fulfillmentType === 'pickup' ? 'Pickup orders' : 'Delivery orders'} value={String(f.orders)} note={formatGHS(f.value)} />)}
                  <Stat label="Cancellation rate" value={pct(r.rates.cancellationRate)} note={METRIC_DEFINITIONS.cancellationRate} />
                  <Stat label="Orders with a refund" value={pct(r.rates.refundRate)} />
                </div>
              </div>
              <div className={`${C_SET_GROUP} set-group`}>
                <div className={C_SET_LABEL}>Kitchen</div>
                <div className={C_REP_STATS}>
                  <Stat label="Average preparation time" value={r.prep.avgPrepMinutes != null ? `${r.prep.avgPrepMinutes} min` : 'n/a'} />
                  <Stat label="Ready on time" value={pct(r.prep.onTimeRate)} note={METRIC_DEFINITIONS.onTimeRate} />
                </div>
              </div>
              <div className={`${C_SET_GROUP} set-group`}>
                <div className={C_SET_LABEL}>Delivery</div>
                <div className={C_REP_STATS}>
                  <Stat label="Deliveries completed" value={`${r.delivery.delivered} of ${r.delivery.deliveries}`} />
                  <Stat label="Failed at least once" value={String(r.delivery.failed)} />
                  <Stat label="Pickup to door (average)" value={r.delivery.avgDeliveryMinutes != null ? `${r.delivery.avgDeliveryMinutes} min` : 'n/a'} />
                </div>
              </div>
              <div className={`${C_SET_GROUP} set-group`}>
                <div className={C_SET_LABEL}>Customers</div>
                <div className={C_REP_STATS}>
                  <Stat label="Repeat customers" value={`${r.repeat.repeatCustomers} of ${r.repeat.customers}`} note="Ordered more than once in this period (by phone number)" />
                </div>
              </div>
            </div>
          </section>
          {(r.riders.length > 0 || r.wastage.length > 0) && (
            <div className="grid-2 [gap:24px] [align-items:start] [margin-bottom:24px] [.rep-grid_+_&]:[margin-top:24px] rep-grid">
              {r.riders.length > 0 && (
                <section className={`panel ${C_REP_PANEL}`}>
                  <div className={C_DSP_HEAD}><h2>Riders</h2><span className={C_DSP_COUNT}>{r.riders.length}</span></div>
                  <div className="table-wrap">
                    <table className={`data ${C_CASES_TABLE}`}><thead><tr><th>Rider</th><th className="num">Delivered</th><th className="num">Failed</th><th className="num">Declined</th><th className="num">Avg min</th></tr></thead><tbody>{r.riders.map((x) => <tr key={x.riderName}><td>{x.riderName}</td><td className="num">{x.completed}</td><td className="num">{x.failed}</td><td className="num">{x.declined}</td><td className="num">{x.avgMinutes ?? ''}</td></tr>)}</tbody></table>
                  </div>
                </section>
              )}
              {r.wastage.length > 0 && (
                <section className={`panel ${C_REP_PANEL}`}>
                  <div className={C_DSP_HEAD}><h2>Recorded wastage</h2></div>
                  <div className="table-wrap">
                    <table className={`data ${C_CASES_TABLE}`}><tbody>{r.wastage.map((w) => <tr key={w.name}><td>{w.name}</td><td className="num">{Number(w.wasted)} {w.unit}</td></tr>)}</tbody></table>
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
