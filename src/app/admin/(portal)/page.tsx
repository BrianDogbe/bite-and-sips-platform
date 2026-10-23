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
import { C_DASH_CARD, C_DASH_CARD_HEAD, C_DASH_ICO, C_DASH_TILE, C_DASH_TILES, C_DSP_COUNT, C_DSP_EMPTY, C_EMPTY_BOX } from '@/components/ui';

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
  kpis.push({ icon: 'alert', label: 'Need attention', value: String(c.attention), hint: c.attention ? 'Review flagged orders' : 'Nothing flagged', href: '/admin/orders?attention=1', tone: c.attention ? 'danger' : undefined });
  if (canFinance) kpis.push({ icon: 'dollar', label: 'Sales today', value: formatGHS(ov.sales.paidSales), hint: 'Verified payments received today', href: '/admin/finance' });
  kpis.push({ icon: 'receipt', label: 'Orders today', value: String(c.todayOrders), hint: `${c.pendingPayment} awaiting payment`, href: '/admin/orders' });
  if (canFinance) kpis.push({ icon: 'trend', label: 'Average paid order', value: ov.sales.aov != null ? formatGHS(ov.sales.aov) : 'None yet', hint: 'Across today’s paid orders', href: '/admin/finance' });

  return (
    <>
      <div className="flex items-start justify-between [gap:16px_24px] flex-wrap [border-bottom:0] [padding-bottom:0] [margin-bottom:24px]">
        <div className="[&_h1]:m-0 [&_h1]:font-extrabold [&_h1]:[font-size:1.5rem] dash-head-text">
          <h1>Dashboard Overview</h1>
          <p className="[.admin-top_h1_+_&]:[margin:10px_0_0] [.admin-top_h1_+_&]:[font-size:1.02rem] [.admin-top_h1_+_&]:[color:var(--ink)] [.dash-head-text_&]:[margin:8px_0_0] [&]:[.dash-head-text_&]:[margin-top:6px] [.dash-head-text_&]:[color:var(--muted)] [.dash-head-text_&]:[font-size:0.95rem] dash-welcome">Welcome back, {firstName}! Here’s what’s happening today.</p>
        </div>
        <div className="flex items-center flex-wrap [gap:10px] [padding-top:6px] dash-head-chips">
          {!settings.ordering.acceptingOrders && <span className="badge danger">Online ordering paused</span>}
          <span className="inline-flex items-center [height:34px] [padding:0_14px] rounded-full [background:#fff] [border:1px_solid_var(--line)] [font-size:0.85rem] font-bold [color:var(--espresso)] [&.muted-chip]:bg-transparent [&.muted-chip]:font-semibold [&.muted-chip]:[color:var(--muted)]">{formatLocalDate(new Date(), tz)}</span>
          <span className="inline-flex items-center [height:34px] [padding:0_14px] rounded-full [background:#fff] [border:1px_solid_var(--line)] [font-size:0.85rem] font-bold [color:var(--espresso)] [&.muted-chip]:bg-transparent [&.muted-chip]:font-semibold [&.muted-chip]:[color:var(--muted)] muted-chip">Test orders excluded</span>
          <LiveRefresh topics={['admin']} />
        </div>
      </div>

      <div className="grid [grid-template-columns:repeat(auto-fit,_minmax(230px,_1fr))] [gap:20px] [margin-bottom:24px]">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className={`flex items-start justify-between [gap:14px] [padding:22px_24px] [background:#fff] [border:1px_solid_var(--line)] [border-radius:16px] no-underline [color:inherit] [box-shadow:0_1px_2px_rgba(53,_37,_31,_0.04)] [transition:box-shadow_0.15s,_transform_0.15s] hover:[box-shadow:0_10px_24px_rgba(53,_37,_31,_0.1)] hover:[transform:translateY(-1px)] dash-kpi${k.tone ? ` ${k.tone}` : ''}`}>
            <div>
              <div className="[color:var(--muted)] [font-size:0.9rem] font-semibold">{k.label}</div>
              <div className="[font-size:1.9rem] font-extrabold [line-height:1.2] [margin:6px_0_4px] tabular-nums [.dash-kpi.danger_&]:[color:var(--danger)]">{k.value}</div>
              <div className="[color:var(--muted)] [font-size:0.82rem]">{k.hint}</div>
            </div>
            <span className={C_DASH_ICO}><Icon name={k.icon} size={22} /></span>
          </Link>
        ))}
      </div>

      <div className="grid [grid-template-columns:repeat(3,_minmax(0,_1fr))] [gap:20px] [margin-bottom:24px] items-stretch max-[1180px]:[grid-template-columns:repeat(2,_minmax(0,_1fr))] max-[760px]:[grid-template-columns:1fr]">
        <section className={`panel ${C_DASH_CARD} dash-card`}>
          <div className={C_DASH_CARD_HEAD}>
            <h2>Kitchen status</h2>
            <Link href="/admin/kitchen" className={`${C_DASH_ICO} sm`} aria-label="Open kitchen monitor"><Icon name="flame" size={18} /></Link>
          </div>
          <div className="flex items-baseline justify-between [&_strong]:[font-size:2rem] [&_strong]:font-extrabold"><span className="muted">Orders in the kitchen</span><strong>{kitchenTotal}</strong></div>
          <div className="[height:10px] rounded-full [background:var(--ivory-2)] overflow-hidden [&.thin]:[height:8px] [&_span]:block [&_span]:[height:100%] [&_span]:rounded-full [&_span]:[background:var(--espresso)]" role="img" aria-label={`${c.newOrders} waiting, ${c.preparing} preparing`}>
            <span style={{ width: kitchenTotal ? `${(c.preparing / kitchenTotal) * 100}%` : '0%' }} />
          </div>
          <div className={C_DASH_TILES}>
            <Link href="/admin/kitchen" className={C_DASH_TILE}><span>Waiting</span><strong>{c.newOrders}</strong></Link>
            <Link href="/admin/kitchen" className={C_DASH_TILE}><span>Preparing</span><strong>{c.preparing}</strong></Link>
            <Link href="/admin/kitchen" className={`${C_DASH_TILE}${c.delayed ? ' danger' : ''}`}><span>Past promised time</span><strong>{c.delayed}</strong></Link>
          </div>
        </section>

        <section className={`panel ${C_DASH_CARD} dash-card`}>
          <div className={C_DASH_CARD_HEAD}>
            <h2>Orders summary</h2>
            <Link href="/admin/orders" className={`${C_DASH_ICO} sm`} aria-label="Open orders"><Icon name="receipt" size={18} /></Link>
          </div>
          <div className={`${C_DASH_TILES} two`}>
            <Link href="/admin/orders" className={C_DASH_TILE}><span>Placed today</span><strong>{c.todayOrders}</strong></Link>
            <Link href="/admin/orders?status=pending_payment" className={C_DASH_TILE}><span>Awaiting payment</span><strong>{c.pendingPayment}</strong></Link>
          </div>
          {canReports && (
            <div className="grid [gap:6px]">
              <div className="small muted">7-day order trend</div>
              <Sparkline values={orderSeries} ariaLabel="Orders per day over the last 7 days" />
            </div>
          )}
          {ov.attention.length === 0 ? (
            <p className={C_DSP_EMPTY}>No orders need attention.</p>
          ) : (
            <ul className="list-none m-0 p-0 grid [gap:10px] [&_li]:flex [&_li]:items-center [&_li]:justify-between [&_li]:[gap:12px] [&_li]:[padding:12px_14px] [&_li]:[border-radius:12px] [&_li]:[background:var(--danger-bg)] [&_li_>_div]:grid [&_li_>_div]:[gap:2px] [&_li_>_div]:[min-width:0] [.admin-main_&_a:not(.btn)]:no-underline">
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

        <section className={`panel ${C_DASH_CARD} dash-card`}>
          <div className={C_DASH_CARD_HEAD}>
            <h2>Pickup and delivery</h2>
            <Link href="/admin/dispatch" className={`${C_DASH_ICO} sm`} aria-label="Open dispatch"><Icon name="bike" size={18} /></Link>
          </div>
          <div className={`${C_DASH_TILES} two`}>
            <Link href="/admin/orders?status=in_progress" className={C_DASH_TILE}><span>Ready for pickup</span><strong>{c.readyPickup}</strong></Link>
            <Link href="/admin/dispatch" className={C_DASH_TILE}><span>Out for delivery</span><strong>{c.outForDelivery}</strong></Link>
          </div>
          <Link href="/admin/dispatch" className={`flex items-center justify-between [gap:12px] [padding:16px_18px] [border-radius:12px] [background:var(--ivory)] [border:1px_solid_var(--line)] no-underline [color:inherit] font-bold [&_strong]:[font-size:1.5rem] [&.danger]:[background:var(--danger-bg)] [&.danger]:[border-color:#f2b8b2] [&.danger]:[color:var(--danger)]${c.awaitingDispatch ? ' danger' : ''}`}>
            <span>Deliveries without a rider</span>
            <strong>{c.awaitingDispatch}</strong>
          </Link>
          {c.awaitingDispatch === 0 && <p className="small muted" style={{ margin: 0 }}>Every delivery has a rider.</p>}
        </section>
      </div>

      <div className="grid [grid-template-columns:minmax(0,_1.7fr)_minmax(0,_1fr)] [gap:20px] [margin-bottom:24px] items-stretch [&.even]:[grid-template-columns:repeat(2,_minmax(0,_1fr))] [&&:has(_>_:only-child)]:[grid-template-columns:1fr] max-[1180px]:[grid-template-columns:1fr] max-[760px]:[&.even]:[grid-template-columns:1fr]">
        {canReports && canFinance && (
          <section className={`panel ${C_DASH_CARD} dash-card`}>
            <div className={C_DASH_CARD_HEAD}>
              <div>
                <h2>Sales &amp; expenses</h2>
                <span className="muted small">Last 7 days</span>
              </div>
              <Link href="/admin/finance" className={`${C_DASH_ICO} sm`} aria-label="Open finance"><Icon name="wallet" size={18} /></Link>
            </div>
            <div className={`${C_DASH_TILES} two`}>
              <div className={`${C_DASH_TILE} sage`}><span>Sales</span><strong>{formatGHS(Math.round(weekSales * 100))}</strong></div>
              <div className={`${C_DASH_TILE} caramel`}><span>Expenses</span><strong>{formatGHS(fin?.expenses ?? Math.round(weekExpenses * 100))}</strong></div>
            </div>
            {weekSales === 0 && weekExpenses === 0 ? (
              <p className={C_EMPTY_BOX}>No sales or expenses recorded in the last 7 days.</p>
            ) : (
              <>
                <LineChart labels={labels} series={[{ name: 'Sales', values: salesSeries, color: '#5d6a52' }, { name: 'Expenses', values: expSeries, color: '#c58b59' }]} ariaLabel="Daily sales and expenses over the last 7 days, in cedis" />
                <div className="flex justify-center [gap:24px] [font-size:0.85rem] [color:var(--muted)] [&_i]:inline-block [&_i]:[width:10px] [&_i]:[height:10px] [&_i]:rounded-[50%] [&_i]:[margin-right:8px]"><span><i style={{ background: '#5d6a52' }} />Sales</span><span><i style={{ background: '#c58b59' }} />Expenses</span></div>
              </>
            )}
          </section>
        )}
        <section className={`panel ${C_DASH_CARD} dash-card`}>
          <div className={C_DASH_CARD_HEAD}>
            <div>
              <h2>Popular this week</h2>
              <span className="muted small">Dishes ordered, last 7 days</span>
            </div>
            <Link href="/admin/menu" className={`${C_DASH_ICO} sm`} aria-label="Open menu"><Icon name="utensils" size={18} /></Link>
          </div>
          {ov.popular.length === 0 ? (
            <p className={C_EMPTY_BOX}>No orders yet this week.</p>
          ) : (
            <ol className="list-none m-0 p-0 grid [gap:18px]">
              {ov.popular.map((x) => (
                <li key={x.name}>
                  <div className="flex justify-between [gap:12px] [margin-bottom:6px] font-semibold"><span>{x.name}</span><strong className="tnum">{x.qty}</strong></div>
                  <div className="[height:10px] rounded-full [background:var(--ivory-2)] overflow-hidden [&.thin]:[height:8px] [&_span]:block [&_span]:[height:100%] [&_span]:rounded-full [&_span]:[background:var(--espresso)] thin"><span style={{ width: `${(x.qty / popMax) * 100}%` }} /></div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className="grid [grid-template-columns:minmax(0,_1.7fr)_minmax(0,_1fr)] [gap:20px] [margin-bottom:24px] items-stretch [&.even]:[grid-template-columns:repeat(2,_minmax(0,_1fr))] [&&:has(_>_:only-child)]:[grid-template-columns:1fr] max-[1180px]:[grid-template-columns:1fr] max-[760px]:[&.even]:[grid-template-columns:1fr] even">
        <section className={`panel ${C_DASH_CARD} dash-card`}>
          <div className={C_DASH_CARD_HEAD}><h2>Quick actions</h2></div>
          <div className="grid [gap:12px]">
            {visibleActions.map((a) => (
              <Link key={a.href} href={a.href} className="flex items-center [gap:14px] [padding:14px_16px] [border:1px_solid_var(--line)] [border-radius:12px] [background:var(--ivory)] no-underline [color:inherit] hover:[border-color:var(--line-strong)] hover:[background:#fff] [&_>_span:last-child]:grid [&_>_span:last-child]:[gap:2px]">
                <span className={`${C_DASH_ICO} sm`}><Icon name={a.icon} size={18} /></span>
                <span>
                  <strong>{a.title}</strong>
                  <span className="small muted">{a.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
        <section className={`panel ${C_DASH_CARD} dash-card`}>
          <div className={C_DASH_CARD_HEAD}>
            <h2>Notifications &amp; reminders</h2>
            <span className={C_DSP_COUNT}>{notes.length}</span>
          </div>
          {notes.length === 0 ? (
            <p className={C_DSP_EMPTY}>All clear. Failed payments, team alerts, low stock and setup reminders show up here.</p>
          ) : (
            <ul className="list-none m-0 p-0 grid [gap:10px] [&_li_>_a]:flex [&_li_>_a]:[gap:12px] [&_li_>_a]:items-start [&_li_>_a]:[padding:12px_14px] [&_li_>_a]:[border:1px_solid_var(--line)] [&_li_>_a]:[border-radius:12px] [&_li_>_a]:no-underline [&_li_>_a]:[color:inherit] [&_li_>_div]:flex [&_li_>_div]:[gap:12px] [&_li_>_div]:items-start [&_li_>_div]:[padding:12px_14px] [&_li_>_div]:[border:1px_solid_var(--line)] [&_li_>_div]:[border-radius:12px] [&_li_>_div]:no-underline [&_li_>_div]:[color:inherit] [&_li_>_a:hover]:[background:var(--ivory)] [&_li_span:last-child]:grid [&_li_span:last-child]:[gap:2px]">
              {notes.slice(0, 8).map((n, i) => {
                const inner = (
                  <>
                    <span className={`flex-none [width:10px] [height:10px] rounded-[50%] [margin-top:6px] [background:var(--info)] [&.danger]:[background:var(--danger)] [&.warn]:[background:var(--caramel)] [&.ok]:[background:var(--ok)] ${n.tone}`} aria-hidden="true" />
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
