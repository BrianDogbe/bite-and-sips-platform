import Link from 'next/link';
import { requirePagePerm } from '@/server/auth/current';
import { customerHistory } from '@/server/reporting';
import { getSettings } from '@/server/settings';
import { formatGHS } from '@/lib/money';
import { formatLocalDateTime } from '@/lib/time';
import { Badge } from '@/components/Badge';
import { labelOrder, orderTone, labelPayment, paymentTone } from '@/lib/status-ui';
import { sql } from '@/server/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Customer' };

export default async function CustomerPage({ params }: { params: Promise<{ phone: string }> }) {
  const user = await requirePagePerm('customers.view', '/admin/login');
  const phone = decodeURIComponent((await params).phone);
  const [orders, r, cases] = await Promise.all([customerHistory(user, phone), getSettings('restaurant'), sql<{ id: string; caseNumber: string; category: string; status: string; createdAt: Date }[]>`select id, case_number, category, status, created_at from support_cases where contact_phone = ${phone} order by created_at desc`]);
  return (
    <>
      <div className="admin-top"><div><p className="muted" style={{ margin: 0 }}><Link href="/admin/customers">Customers</Link></p><h1>{phone}</h1></div></div>
      <div className="two-col">
        <section className="panel">
          <h2 style={{ fontSize: '1.15rem' }}>Orders</h2>
          <div className="table-wrap">
            <table className="data">
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/admin/orders/${o.id}`} className="tnum">{o.orderNumber}</Link><div className="small muted">{formatLocalDateTime(o.createdAt, r.timezone)}</div></td>
                    <td>{o.fulfillmentType}</td>
                    <td><Badge tone={orderTone(o.status)}>{labelOrder(o.status)}</Badge></td>
                    <td><Badge tone={paymentTone(o.paymentStatus)}>{labelPayment(o.paymentStatus)}</Badge></td>
                    <td className="num">{formatGHS(o.totalPesewas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <h2 style={{ fontSize: '1.15rem' }}>Support cases</h2>
          {cases.length === 0 ? <p className="muted">None.</p> : <ul>{cases.map((c) => <li key={c.id}><Link href={`/admin/support/${c.id}`}>{c.caseNumber}</Link>: {c.category.replace('_', ' ')} ({c.status})</li>)}</ul>}
        </section>
      </div>
    </>
  );
}
