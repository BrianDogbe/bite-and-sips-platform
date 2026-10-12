import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/current';
import { customerOrders } from '@/server/orders/queries';
import { sql } from '@/server/db';
import { formatGHS } from '@/lib/money';
import { formatLocalDateTime } from '@/lib/time';
import { getStorefront } from '@/server/storefront';
import { labelOrder, orderTone } from '@/lib/status-ui';
import { Badge } from '@/components/Badge';
import { LogoutButton } from '@/components/LoginForm';
import { ReorderButton } from '@/components/shop/ReorderButton';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { saveNotificationPrefs } from './actions';

export const metadata: Metadata = { title: 'Your account' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/account/login');
  if (!user.roles.includes('customer')) {
    return (
      <div className="wrap section">
        <h1>Staff account</h1>
        <p>You’re signed in with a staff account. Customer order history isn’t available for staff accounts.</p>
        <LogoutButton to="/" />
      </div>
    );
  }
  const [orders, sf, prefsRows] = await Promise.all([customerOrders(user), getStorefront(), sql<{ notifySms: boolean; notifyEmail: boolean; marketingOptIn: boolean }[]>`select notify_sms, notify_email, marketing_opt_in from customer_profiles where user_id = ${user.id}`]);
  const prefs = prefsRows[0] ?? { notifySms: true, notifyEmail: true, marketingOptIn: false };
  const tz = sf.restaurant.timezone;
  return (
    <div className="wrap section" style={{ paddingTop: 28 }}>
      <div className="row between">
        <h1>Hi, {user.fullName.split(' ')[0]}</h1>
        <LogoutButton to="/" />
      </div>
      <div className="two-col" style={{ marginTop: 12 }}>
        <section className="panel">
          <h2>Your orders</h2>
          {orders.length === 0 ? (
            <div className="empty">
              <p>You haven’t ordered yet.</p>
              <Link href="/menu" className="btn primary">
                Browse the menu
              </Link>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Items</th>
                    <th className="num">Total</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <strong className="tnum">{o.orderNumber}</strong>
                        <div className="muted small">{formatLocalDateTime(o.createdAt, tz)}</div>
                      </td>
                      <td className="small">{o.itemSummary}</td>
                      <td className="num">{formatGHS(o.totalPesewas)}</td>
                      <td>
                        <Badge tone={orderTone(o.status)}>{labelOrder(o.status)}</Badge>
                      </td>
                      <td className="nowrap">
                        <Link href={`/track/${o.trackingToken}`} className="btn sm">
                          View
                        </Link>{' '}
                        <ReorderButton orderId={o.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel">
          <h2>Notifications</h2>
          <ActionForm action={saveNotificationPrefs} className="stack">
            <label className="check">
              <input type="checkbox" name="sms" defaultChecked={prefs.notifySms} /> <span>Text me order updates</span>
            </label>
            <label className="check">
              <input type="checkbox" name="email" defaultChecked={prefs.notifyEmail} /> <span>Email me receipts and order updates</span>
            </label>
            <label className="check">
              <input type="checkbox" name="marketing" defaultChecked={prefs.marketingOptIn} /> <span>Tell me about offers (optional)</span>
            </label>
            <SubmitButton className="btn">Save preferences</SubmitButton>
          </ActionForm>
          <hr className="hr" />
          <dl className="kv">
            <dt>Email</dt>
            <dd>{user.email}</dd>
            <dt>Phone</dt>
            <dd>{user.phone}</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}
