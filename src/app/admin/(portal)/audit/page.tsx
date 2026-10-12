import { requirePagePerm } from '@/server/auth/current';
import { listAudit } from '@/server/audit';
import { getSettings } from '@/server/settings';
import { formatLocalDateTime } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Audit log' };

export default async function Audit({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requirePagePerm('audit.view', '/admin/login');
  const sp = await searchParams;
  const [rows, r] = await Promise.all([listAudit({ entityType: sp.type || undefined, limit: 300 }), getSettings('restaurant')]);
  return (
    <>
      <div className="admin-top"><h1>Audit log</h1></div>
      <p className="muted">Financial, staff, menu, settings and delivery actions, newest first. Order-level history is also on each order page.</p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="small nowrap">{formatLocalDateTime(a.createdAt, r.timezone)}</td>
                <td className="small">{a.actorName ?? a.actorLabel}</td>
                <td>{a.action}</td>
                <td className="small">{a.entityType} {a.entityId?.slice(0, 12)}</td>
                <td className="small" style={{ maxWidth: 420, wordBreak: 'break-word' }}>{JSON.stringify(a.data).slice(0, 240)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
