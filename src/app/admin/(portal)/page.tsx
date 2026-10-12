import Link from 'next/link';
import { requirePagePerm } from '@/server/auth/current';
import { overview } from '@/server/reporting';
import { openExceptions } from '@/server/ops';
import { getAllSettings } from '@/server/settings';
import { formatGHS } from '@/lib/money';
import { formatLocalTime, formatLocalDate } from '@/lib/time';
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

  return (
    <>
      <div className="admin-top">
        <div>
          <h1>Today</h1>
          <p className="muted" style={{ margin: 0 }}>
            {formatLocalDate(new Date(), tz)}. Figures exclude test orders.
          </p>
        </div>
        <div className="row">
          {!settings.ordering.acceptingOrders && <span className="badge danger">Online ordering paused</span>}
          <LiveRefresh topics={['admin']} />
        </div>
      </div>

      {pending.length > 0 && user.permissions.has('settings.manage') && (
        <section className="panel" style={{ marginBottom: 18, borderColor: 'var(--accent-2)', background: 'var(--caramel-tint)' }}>
          <h2 style={{ fontSize: '1.15rem' }}>Before you launch</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {pending.map((t) => (
              <li key={t.label}>
                <Link href={t.href}>{t.label}</Link>
                {t.optional ? <span className="muted"> (if applicable)</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="kpis">
        <Link href="/admin/orders?attention=1" className={`kpi ${c.attention ? 'alert-kpi' : ''}`}>
          <div className="v">{c.attention}</div>
          <div className="l">Need attention</div>
        </Link>
        <Link href="/admin/kitchen" className={`kpi ${c.delayed ? 'alert-kpi' : ''}`}>
          <div className="v">{c.delayed}</div>
          <div className="l">Past promised time, not ready</div>
        </Link>
        <Link href="/admin/kitchen" className="kpi">
          <div className="v">{c.newOrders}</div>
          <div className="l">Waiting for kitchen</div>
        </Link>
        <Link href="/admin/kitchen" className="kpi">
          <div className="v">{c.preparing}</div>
          <div className="l">Preparing</div>
        </Link>
        <Link href="/admin/orders?status=in_progress" className="kpi">
          <div className="v">{c.readyPickup}</div>
          <div className="l">Ready for pickup</div>
        </Link>
        <Link href="/admin/dispatch" className={`kpi ${c.awaitingDispatch ? 'alert-kpi' : ''}`}>
          <div className="v">{c.awaitingDispatch}</div>
          <div className="l">Deliveries without a rider</div>
        </Link>
        <Link href="/admin/dispatch" className="kpi">
          <div className="v">{c.outForDelivery}</div>
          <div className="l">Out for delivery</div>
        </Link>
        <Link href="/admin/orders?status=pending_payment" className="kpi">
          <div className="v">{c.pendingPayment}</div>
          <div className="l">Awaiting payment</div>
        </Link>
      </div>

      <div className="two-col" style={{ marginTop: 18 }}>
        <div className="stack" style={{ ['--stack' as string]: '18px' }}>
          {user.permissions.has('finance.view') && (
            <section className="panel">
              <h2 style={{ fontSize: '1.15rem' }}>Sales today</h2>
              <div className="kpis">
                <div>
                  <div className="kpi" style={{ border: 0, padding: 0 }}>
                    <div className="v">{formatGHS(ov.sales.paidSales)}</div>
                    <div className="l">Paid sales (verified payments received today)</div>
                  </div>
                </div>
                <div className="kpi" style={{ border: 0, padding: 0 }}>
                  <div className="v">{c.todayOrders}</div>
                  <div className="l">Orders placed today</div>
                </div>
                <div className="kpi" style={{ border: 0, padding: 0 }}>
                  <div className="v">{ov.sales.aov != null ? formatGHS(ov.sales.aov) : 'None yet'}</div>
                  <div className="l">Average paid order</div>
                </div>
              </div>
              {c.paymentExceptions > 0 && (
                <p className="alert error" style={{ marginTop: 12 }}>
                  {c.paymentExceptions} payment(s) need reconciliation. <Link href="/admin/orders?payment=reconciliation_required">Review</Link>
                </p>
              )}
            </section>
          )}
          <section className="panel">
            <h2 style={{ fontSize: '1.15rem' }}>Orders needing attention</h2>
            {ov.attention.length === 0 ? (
              <p className="muted">Nothing flagged. Failed payments, failed deliveries and kitchen alerts appear here.</p>
            ) : (
              <ul className="event-list">
                {ov.attention.map((a) => (
                  <li key={a.id}>
                    <Link href={`/admin/orders/${a.id}`} className="tnum">
                      {a.orderNumber}
                    </Link>
                    <span>
                      {a.attentionReason} <span className="muted small">({formatLocalTime(a.updatedAt, tz)})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel">
            <h2 style={{ fontSize: '1.15rem' }}>Open alerts from the team</h2>
            {exceptions.length === 0 ? (
              <p className="muted">No open alerts.</p>
            ) : (
              <ul className="event-list">
                {exceptions.slice(0, 10).map((e) => (
                  <li key={e.id}>
                    <span className="muted small">{formatLocalTime(e.raisedAt, tz)}</span>
                    <span>
                      {e.orderNumber && (
                        <Link href={`/admin/orders/${e.orderId}`} className="tnum">
                          {e.orderNumber}
                        </Link>
                      )}{' '}
                      {e.message} <span className="muted small">by {e.raisedByName ?? 'system'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div className="stack" style={{ ['--stack' as string]: '18px' }}>
          <section className="panel">
            <h2 style={{ fontSize: '1.15rem' }}>Popular this week</h2>
            {ov.popular.length === 0 ? (
              <p className="muted">No orders yet this week.</p>
            ) : (
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {ov.popular.map((p) => (
                  <li key={p.name}>
                    {p.name} <span className="muted">({p.qty})</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="panel">
            <h2 style={{ fontSize: '1.15rem' }}>Low stock</h2>
            {ov.lowStock.length === 0 ? (
              <p className="muted">No stock items at or below their reorder level{user.permissions.has('inventory.manage') ? '' : ''}.</p>
            ) : (
              <ul className="event-list">
                {ov.lowStock.map((s) => (
                  <li key={s.id}>
                    <span className="tnum">
                      {Number(s.quantity)} {s.unit}
                    </span>
                    <span>
                      {s.name} <span className="muted small">(reorder at {Number(s.reorderLevel)})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {user.permissions.has('support.manage') && (
            <section className="panel">
              <h2 style={{ fontSize: '1.15rem' }}>Support</h2>
              <p>
                <Link href="/admin/support">{ov.openCases} open case(s)</Link>
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
