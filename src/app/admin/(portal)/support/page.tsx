import Link from 'next/link';
import { requirePagePerm } from '@/server/auth/current';
import { listCases } from '@/server/support';
import { getSettings } from '@/server/settings';
import { formatLocalDateTime } from '@/lib/time';
import { Badge } from '@/components/Badge';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Support' };

export default async function Support({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePagePerm('support.manage', '/admin/login');
  const sp = await searchParams;
  const status = ['open', 'in_progress', 'resolved'].includes(sp.status ?? '') ? sp.status! : null;
  const [cases, r] = await Promise.all([listCases(user, status), getSettings('restaurant')]);
  return (
    <>
      <div className="admin-top">
        <div>
          <h1>Support cases</h1>
          <p className="muted" style={{ margin: 0 }}>Problems customers report from the Help page.</p>
        </div>
      </div>
      <nav className="tabs tabs-pills" aria-label="Case status">
        {[['', 'All'], ['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved']].map(([k, l]) => (
          <Link key={k} href={k ? `/admin/support?status=${k}` : '/admin/support'} aria-current={(status ?? '') === k ? 'page' : undefined}>{l}</Link>
        ))}
      </nav>
      {cases.length === 0 ? <div className="empty panel empty-box"><h3>No cases</h3><p>Customer reports from the Help page appear here.</p></div> : (
        <div className="table-wrap">
          <table className="data cases-table">
            <thead><tr><th>Case</th><th>Customer</th><th>Problem</th><th>Status</th><th>Assigned</th></tr></thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/admin/support/${c.id}`} style={{ fontWeight: 700 }}>{c.caseNumber}</Link><div className="small muted">{formatLocalDateTime(c.createdAt, r.timezone)}</div>{c.orderNumber && <div className="small"><Link href={`/admin/orders/${c.orderId}`}>{c.orderNumber}</Link></div>}</td>
                  <td>{c.contactName}<div className="small muted">{c.contactPhone ?? c.contactEmail}</div></td>
                  <td>{c.category.replace(/_/g, ' ')}<div className="small muted" style={{ maxWidth: 360 }}>{c.message.slice(0, 140)}</div></td>
                  <td><Badge tone={c.status === 'resolved' ? 'ok' : c.status === 'open' ? 'warn' : 'info'}>{c.status.replace('_', ' ')}</Badge></td>
                  <td className="small">{c.assignedName ?? 'Unassigned'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
