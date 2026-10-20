import Link from 'next/link';
import { requirePagePerm } from '@/server/auth/current';
import { customersList } from '@/server/reporting';
import { getSettings } from '@/server/settings';
import { formatGHS } from '@/lib/money';
import { formatLocalDate } from '@/lib/time';
import { C_ADMIN_TOP, C_CASES_TABLE, C_EMPTY_BOX } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Customers' };

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePagePerm('customers.view', '/admin/login');
  const sp = await searchParams;
  const [rows, r] = await Promise.all([customersList(user, sp.q ?? null), getSettings('restaurant')]);
  return (
    <>
      <div className={`${C_ADMIN_TOP} admin-top`}>
        <div>
          <h1>Customers</h1>
          <p className="muted" style={{ margin: 0 }}>{rows.length} {rows.length === 1 ? 'customer' : 'customers'}{sp.q ? ` matching “${sp.q}”` : ''}</p>
        </div>
      </div>
      <form className="flex items-center [gap:12px] [margin-bottom:28px] [padding:16px_20px] [max-width:760px] [&_.input]:[flex:1_1_auto] [&_.input]:[min-width:0] max-[520px]:flex-wrap max-[520px]:[&_.input]:[flex-basis:100%] panel" method="get" role="search">
        <label htmlFor="cq" className="sr-only">Search customers</label>
        <input id="cq" name="q" className="input" defaultValue={sp.q} placeholder="Search by name, phone or email" />
        <button className="btn leaf">Search</button>
        {sp.q && <Link href="/admin/customers" className="btn ghost">Clear</Link>}
      </form>
      {rows.length === 0 ? <div className={`empty panel ${C_EMPTY_BOX}`}><h3>{sp.q ? 'No customers match' : 'No customers yet'}</h3><p>{sp.q ? 'Try a different name, phone number or email.' : 'Customers appear here after their first confirmed order.'}</p></div> : (
        <div className="table-wrap">
          <table className={`data ${C_CASES_TABLE}`}>
            <thead><tr><th>Customer</th><th className="num">Orders</th><th className="num">Net spend</th><th>Last order</th><th>Signals</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.phone}>
                  <td><Link href={`/admin/customers/${encodeURIComponent(c.phone)}`} style={{ fontWeight: 700 }}>{c.name}</Link><div className="small muted">{c.phone}{c.email ? `, ${c.email}` : ''}{c.hasAccount ? ' (account)' : ''}</div></td>
                  <td className="num">{c.orders}</td>
                  <td className="num">{formatGHS(c.spent)}</td>
                  <td className="small">{formatLocalDate(c.lastOrderAt, r.timezone)}</td>
                  <td className="small">{[c.cancelled ? `${c.cancelled} cancelled` : '', c.deliveryFailures ? `${c.deliveryFailures} failed deliveries` : '', c.supportCases ? `${c.supportCases} support cases` : ''].filter(Boolean).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
