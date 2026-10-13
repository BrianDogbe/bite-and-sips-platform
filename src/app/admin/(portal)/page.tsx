import Link from 'next/link';
import { requirePagePerm } from '@/server/auth/current';
import { overview, reports, financeSummary, listExpenses } from '@/server/reporting';
import { openExceptions } from '@/server/ops';
import { getAllSettings } from '@/server/settings';
import { formatGHS } from '@/lib/money';
import { formatLocalTime, formatLocalDate, localDateKey } from '@/lib/time';
import { resolvePeriod } from '@/server/period';
import { Icon, type IconName } from '@/components/Icon';
import { LineChart, Sparkline } from '@/components/admin/charts';
import { LiveRefresh } from '@/components/admin/LiveRefresh';
import { sql } from '@/server/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Overview' };

export default async function Overview() {
  const user = await requirePagePerm('dashboard.view', '/admin/login');
  const [ov, exceptions, settings, setupRows] = await Promise.all([
    overview(user),
    openExceptions(),
    getAllSettings(),
    sql<{ demoItems: number; realItems: number; hours: number; zones: number; owners: number }[]>`
      select (select count(*)::int from menu_items where is_demo and not is_archived) as demo_items,
             (select count(*)::int from menu_items where not is_demo and not is_archived) as real_items,
             (select count(*)::int from operating_hours) as hours,
             (select count(*)::int from delivery_zones where is_active and not is_demo) as zones,
             (select count(*)::int from user_roles where role = 'owner') as owners`,
  ]);
  const setup = setupRows[0];
  const tz = ov.timezone;
  const c = ov.counts;
  const setupTasks = [
    { done: settings.restaurant.isConfigured, label: 'Enter the restaurant’s real name, address, phone and location', href: '/admin/settings' },
    { done: setup.realItems > 0 && setup.demoItems === 0, label: setup.demoItems ? `Replace the ${setup.demoItems} demo menu items with the real menu` : 'Add the real menu', href: '/admin/menu' },
    { done: setup.hours > 0, label: 'Set opening hours', href: '/admin/settings?tab=hours' },
    { done: setup.zones > 0 || !settings.ordering.deliveryEnabled, label: 'Define real delivery zones and fees', href: '/admin/settings?tab=zones' },
    { done: settings.ordering.taxBps > 0 || settings.ordering.serviceChargeBps > 0, label: 'Confirm taxes/levies and service charge (currently none)', href: '/admin/settings?tab=ordering', optional: true },
  ];
  const pending = setupTasks.filter((t) => !t.done);

  // Last 7 days, for the trend charts.
  const canFinance = user.permissions.has('finance.view');
  const canReports = user.permissions.has('reports.view');
  const keys = Array.from({ length: 7 }, (_, k) => localDateKey(new Date(Date.now() - (6 - k) * 86400_000), tz));
  const labels = keys.map((k) => new Date(`${k}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }));
  const per = resolvePeriod({}, tz, 7);
  const [rep, exp, fin] = await Promise.all([
    canReports ? reports(user, per.from, per.to) : Promise.resolve(null),
    canFinance ? listExpenses(user, per.from, per.to) : Promise.resolve(null),
    canFinance ? financeSummary(user, per.from, per.to) : Promise.resolve(null),
  ]);
  const dailyMap = new Map((rep?.daily ?? []).map((d) => [d.day, d]));
  const salesSeries = keys.map((k) => (dailyMap.get(k)?.paidSales ?? 0) / 100);
  const orderSeries = keys.map((k) => dailyMap.get(k)?.orders ?? 0);
  const expMap = new Map<string, number>();
  for (const e of exp ?? []) expMap.set(e.incurredOn.toISOString().slice(0, 10), (expMap.get(e.incurredOn.toISOString().slice(0, 10)) ?? 0) + e.amountPesewas);
  const expSeries = keys.map((k) => (expMap.get(k) ?? 0) / 100);
  const weekSales = salesSeries.reduce((a, b) => a + b, 0);
  const weekExpenses = expSeries.reduce((a, b) => a + b, 0);
  const popMax = Math.max(1, ...ov.popular.map((x) => x.qty));
  const kitchenTotal = c.newOrders + c.preparing;
  const firstName = user.fullName.trim().split(' ')[0];

  type Note = { tone: 'danger' | 'warn' | 'info' | 'ok'; title: string; desc: string; href?: string };
  const notes: Note[] = [];
  if (c.paymentExceptions > 0) notes.push({ tone: 'danger', title: 'Payments need reconciliation', desc: `${c.paymentExceptions} payment(s) to review`, href: '/admin/orders?payment=reconciliation_required' });
  for (const e of exceptions.slice(0, 4)) notes.push({ tone: 'warn', title: e.message, desc: `${e.orderNumber ? `${e.orderNumber} · ` : ''}by ${e.raisedByName ?? 'system'} at ${formatLocalTime(e.raisedAt, tz)}`, href: e.orderId ? `/admin/orders/${e.orderId}` : undefined });
  for (const sItem of ov.lowStock.slice(0, 3)) notes.push({ tone: 'danger', title: `Low stock: ${sItem.name}`, desc: `${Number(sItem.quantity)} ${sItem.unit} left, reorder at ${Number(sItem.reorderLevel)}`, href: '/admin/inventory' });
  if (user.permissions.has('support.manage') && ov.openCases > 0) notes.push({ tone: 'info', title: `${ov.openCases} open support case(s)`, desc: 'Customers waiting for a reply', href: '/admin/support' });
  if (user.permissions.has('settings.manage')) for (const t of pending) notes.push({ tone: 'info', title: t.label, desc: 'Before you launch', href: t.href });

  const actions: { href: string; icon: IconName; title: string; desc: string; show: boolean }[] = [
    { href: '/admin/menu/new', icon: 'utensils', title: 'Add a dish', desc: 'Add a new item to the menu', show: user.permissions.has('menu.manage') },
    { href: '/admin/inventory', icon: 'box', title: 'Update stock', desc: 'Add or adjust inventory items', show: user.permissions.has('inventory.manage') },
    { href: '/admin/promotions', icon: 'tag', title: 'Create a promotion', desc: 'Offer a discount or promo code', show: user.permissions.has('menu.manage') },
    { href: '/admin/finance', icon: 'wallet', title: 'Record an expense', desc: 'Log gas, packaging, wages and more', show: canFinance },
    { href: '/admin/reports', icon: 'chart', title: 'View reports', desc: 'Sales, best sellers and operations', show: canReports },
  ];
  const visibleActions = actions.filter((a) => a.show);

  const kpis: { icon: IconName; label: string; value: string; hint: string; href: string; tone?: 'danger' }[] = [];
  if (canFinance) kpis.push({ icon: 'dollar', label: 'Sales today', value: formatGHS(ov.sales.paidSales), hint: 'Verified payments received today', href: '/admin/finance' });
  kpis.push({ icon: 'receipt', label: 'Orders today', value: String(c.todayOrders), hint: `${c.pendingPayment} awaiting payment`, href: '/admin/orders' });
  if (canFinance) kpis.push({ icon: 'trend', label: 'Average paid order', value: ov.sales.aov != null ? formatGHS(ov.sales.aov) : 'None yet', hint: 'Across today’s paid orders', href: '/admin/finance' });
  kpis.push({ icon: 'alert', label: 'Need attention', value: String(c.attention), hint: c.attention ? 'Review flagged orders' : 'Nothing flagged', href: '/admin/orders?attention=1', tone: c.attention ? 'danger' : undefined });

  return (
    <>
      <div className="dash-head">
        <div className="dash-head-text">
          <h1>Dashboard Overview</h1>
          <p className="dash-welcome">Welcome back, {firstName}! Here’s what’s happening today.</p>
        </div>
        <div className="dash-head-chips">
          {!settings.ordering.acceptingOrders && <span className="badge danger">Online ordering paused</span>}
          <span className="dash-chip">{formatLocalDate(new Date(), tz)}</span>
          <span className="dash-chip muted-chip">Test orders excluded</span>
          <LiveRefresh topics={['admin']} />
        </div>
      </div>

      <div className="dash-kpis">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className={`dash-kpi${k.tone ? ` ${k.tone}` : ''}`}>
            <div>
              <div className="dash-kpi-l">{k.label}</div>
              <div className="dash-kpi-v">{k.value}</div>
              <div className="dash-kpi-h">{k.hint}</div>
            </div>
            <span className="dash-ico"><Icon name={k.icon} size={22} /></span>
          </Link>
        ))}
      </div>

      <div className="dash-row3">
        <section className="panel dash-card">
          <div className="dash-card-head">
            <h2>Kitchen status</h2>
            <Link href="/admin/kitchen" className="dash-ico sm" aria-label="Open kitchen monitor"><Icon name="flame" size={18} /></Link>
          </div>
          <div className="dash-total"><span className="muted">Orders in the kitchen</span><strong>{kitchenTotal}</strong></div>
          <div className="dash-meter" role="img" aria-label={`${c.newOrders} waiting, ${c.preparing} preparing`}>
            <span style={{ width: kitchenTotal ? `${(c.preparing / kitchenTotal) * 100}%` : '0%' }} />
          </div>
          <div className="dash-tiles">
            <Link href="/admin/kitchen" className="dash-tile"><span>Waiting</span><strong>{c.newOrders}</strong></Link>
            <Link href="/admin/kitchen" className="dash-tile"><span>Preparing</span><strong>{c.preparing}</strong></Link>
            <Link href="/admin/kitchen" className={`dash-tile${c.delayed ? ' danger' : ''}`}><span>Past promised time</span><strong>{c.delayed}</strong></Link>
          </div>
        </section>

        <section className="panel dash-card">
          <div className="dash-card-head">
            <h2>Orders summary</h2>
            <Link href="/admin/orders" className="dash-ico sm" aria-label="Open orders"><Icon name="receipt" size={18} /></Link>
          </div>
          <div className="dash-tiles two">
            <Link href="/admin/orders" className="dash-tile"><span>Placed today</span><strong>{c.todayOrders}</strong></Link>
            <Link href="/admin/orders?status=pending_payment" className="dash-tile"><span>Awaiting payment</span><strong>{c.pendingPayment}</strong></Link>
          </div>
          {canReports && (
            <div className="dash-trend">
              <div className="small muted">7-day order trend</div>
              <Sparkline values={orderSeries} ariaLabel="Orders per day over the last 7 days" />
            </div>
          )}
          {ov.attention.length === 0 ? (
            <p className="dsp-empty">No orders need attention.</p>
          ) : (
            <ul className="dash-list">
              {ov.attention.slice(0, 3).map((a) => (
                <li key={a.id}>
                  <div>
                    <strong className="tnum">{a.orderNumber}</strong>
                    <span className="small muted">{a.attentionReason ?? 'Needs attention'}</span>
                  </div>
                  <Link href={`/admin/orders/${a.id}`} className="btn sm ghost">Review</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel dash-card">
          <div className="dash-card-head">
            <h2>Pickup and delivery</h2>
            <Link href="/admin/dispatch" className="dash-ico sm" aria-label="Open dispatch"><Icon name="bike" size={18} /></Link>
          </div>
          <div className="dash-tiles two">
            <Link href="/admin/orders?status=in_progress" className="dash-tile"><span>Ready for pickup</span><strong>{c.readyPickup}</strong></Link>
            <Link href="/admin/dispatch" className="dash-tile"><span>Out for delivery</span><strong>{c.outForDelivery}</strong></Link>
          </div>
          <Link href="/admin/dispatch" className={`dash-callout${c.awaitingDispatch ? ' danger' : ''}`}>
            <span>Deliveries without a rider</span>
            <strong>{c.awaitingDispatch}</strong>
          </Link>
          {c.awaitingDispatch === 0 && <p className="small muted" style={{ margin: 0 }}>Every delivery has a rider.</p>}
        </section>
      </div>

      <div className="dash-row2">
        {canReports && canFinance && (
          <section className="panel dash-card">
            <div className="dash-card-head">
              <div>
                <h2>Sales &amp; expenses</h2>
                <span className="muted small">Last 7 days</span>
              </div>
              <Link href="/admin/finance" className="dash-ico sm" aria-label="Open finance"><Icon name="wallet" size={18} /></Link>
            </div>
            <div className="dash-tiles two">
              <div className="dash-tile sage"><span>Sales</span><strong>{formatGHS(Math.round(weekSales * 100))}</strong></div>
              <div className="dash-tile caramel"><span>Expenses</span><strong>{formatGHS(fin?.expenses ?? Math.round(weekExpenses * 100))}</strong></div>
            </div>
            {weekSales === 0 && weekExpenses === 0 ? (
              <p className="empty-box">No sales or expenses recorded in the last 7 days.</p>
            ) : (
              <>
                <LineChart labels={labels} series={[{ name: 'Sales', values: salesSeries, color: '#5d6a52' }, { name: 'Expenses', values: expSeries, color: '#c58b59' }]} ariaLabel="Daily sales and expenses over the last 7 days, in cedis" />
                <div className="dash-legend"><span><i style={{ background: '#5d6a52' }} />Sales</span><span><i style={{ background: '#c58b59' }} />Expenses</span></div>
              </>
            )}
          </section>
        )}
        <section className="panel dash-card">
          <div className="dash-card-head">
            <div>
              <h2>Popular this week</h2>
              <span className="muted small">Dishes ordered, last 7 days</span>
            </div>
            <Link href="/admin/menu" className="dash-ico sm" aria-label="Open menu"><Icon name="utensils" size={18} /></Link>
          </div>
          {ov.popular.length === 0 ? (
            <p className="empty-box">No orders yet this week.</p>
          ) : (
            <ol className="dash-pop">
              {ov.popular.map((x) => (
                <li key={x.name}>
                  <div className="dash-pop-top"><span>{x.name}</span><strong className="tnum">{x.qty}</strong></div>
                  <div className="dash-meter thin"><span style={{ width: `${(x.qty / popMax) * 100}%` }} /></div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="dash-row2 even">
        <section className="panel dash-card">
          <div className="dash-card-head"><h2>Quick actions</h2></div>
          <div className="dash-actions">
            {visibleActions.map((a) => (
              <Link key={a.href} href={a.href} className="dash-action">
                <span className="dash-ico sm"><Icon name={a.icon} size={18} /></span>
                <span>
                  <strong>{a.title}</strong>
                  <span className="small muted">{a.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
        <section className="panel dash-card">
          <div className="dash-card-head">
            <h2>Notifications &amp; reminders</h2>
            <span className="dsp-count">{notes.length}</span>
          </div>
          {notes.length === 0 ? (
            <p className="dsp-empty">All clear. Failed payments, team alerts, low stock and setup reminders show up here.</p>
          ) : (
            <ul className="dash-notes">
              {notes.slice(0, 8).map((n, i) => {
                const inner = (
                  <>
                    <span className={`dash-dot ${n.tone}`} aria-hidden="true" />
                    <span>
                      <strong>{n.title}</strong>
                      <span className="small muted">{n.desc}</span>
                    </span>
                  </>
                );
                return <li key={i}>{n.href ? <Link href={n.href}>{inner}</Link> : <div>{inner}</div>}</li>;
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
