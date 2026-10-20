import Link from 'next/link';
import { requirePagePerm } from '@/server/auth/current';
import { listAudit } from '@/server/audit';
import { getSettings } from '@/server/settings';
import { formatLocalDateTime } from '@/lib/time';
import { Badge } from '@/components/Badge';
import { C_ADMIN_TOP, C_CASES_TABLE, C_DSP_COUNT, C_DSP_HEAD, C_EMPTY_BOX, C_TABS } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Audit log' };

function tone(action: string): 'ok' | 'warn' | 'danger' | 'info' | 'neutral' {
  if (/(deleted|deactivated|refund|failed|discrepancy)/.test(action)) return 'danger';
  if (/(reset|roles|settings|owner_created)/.test(action)) return 'warn';
  if (/(verified|reconciled|created|assigned|activated)/.test(action)) return 'ok';
  return 'neutral';
}

function short(v: unknown): string {
  if (v == null) return 'none';
  const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return t.length > 40 ? `${t.slice(0, 12)}…` : t;
}

function Details({ data }: { data: unknown }) {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return data == null ? <span className="muted">–</span> : <span className="small">{short(data)}</span>;
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) return <span className="muted">–</span>;
  return (
    <ul className="list-none m-0 p-0 flex flex-wrap [gap:6px] [max-width:460px] [&_li]:[font-size:0.8rem] [&_li]:[padding:4px_10px] [&_li]:rounded-full [&_li]:[background:var(--ivory-2)] [&_li]:[border:1px_solid_var(--line)] [&_li]:[overflow-wrap:anywhere]">
      {entries.map(([k, v]) => (
        <li key={k} title={typeof v === 'object' ? JSON.stringify(v) : String(v)}>
          <span className="muted">{k}</span> {short(v)}
        </li>
      ))}
    </ul>
  );
}

export default async function Audit({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requirePagePerm('audit.view', '/admin/login');
  const sp = await searchParams;
  const type = sp.type || undefined;
  const [rows, all, r] = await Promise.all([listAudit({ entityType: type, limit: 300 }), type ? listAudit({ limit: 300 }) : Promise.resolve(null), getSettings('restaurant')]);
  const types = Array.from(new Set((all ?? rows).map((a) => a.entityType))).sort();
  return (
    <>
      <div className={`${C_ADMIN_TOP} admin-top`}>
        <div>
          <h1>Audit log</h1>
          <p className="muted" style={{ margin: 0 }}>Financial, staff, menu, settings and delivery actions, newest first. Order-level history is also on each order page.</p>
        </div>
      </div>
      {types.length > 1 && (
        <nav className={`${C_TABS} tabs-pills [margin-bottom:20px] flex-wrap`} aria-label="Filter by record type">
          <Link href="/admin/audit" aria-current={!type ? 'page' : undefined}>All</Link>
          {types.map((t) => (
            <Link key={t} href={`/admin/audit?type=${encodeURIComponent(t)}`} aria-current={type === t ? 'page' : undefined}>{t.replace(/_/g, ' ')}</Link>
          ))}
        </nav>
      )}
      <section className="panel [padding:clamp(20px,_2.4vw,_30px)]">
        <div className={C_DSP_HEAD}><h2>Activity <span className={C_DSP_COUNT}>{rows.length}</span></h2></div>
        {rows.length === 0 ? <p className={C_EMPTY_BOX}>No activity recorded yet.</p> : (
          <div className="table-wrap">
            <table className={`data ${C_CASES_TABLE}`}>
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="small nowrap">{formatLocalDateTime(a.createdAt, r.timezone)}</td>
                    <td>{a.actorName ?? a.actorLabel}</td>
                    <td><Badge tone={tone(a.action)}>{a.action}</Badge></td>
                    <td className="small"><span className="muted">{a.entityType.replace(/_/g, ' ')}</span><div className="tnum">{a.entityId?.slice(0, 12)}</div></td>
                    <td><Details data={a.data} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
