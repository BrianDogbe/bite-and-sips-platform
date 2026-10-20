import Link from 'next/link';
import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePagePerm, getCurrentUser } from '@/server/auth/current';
import { caseDetail, updateCase } from '@/server/support';
import { getSettings } from '@/server/settings';
import { runAction, str, bool } from '@/server/action';
import { formatLocalDateTime } from '@/lib/time';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { isDomainError } from '@/server/errors';
import type { ActionResult } from '@/lib/action-result';
import { C_ADMIN_TOP, C_EVENT_LIST, C_TWO_COL } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Support case' };

async function update(id: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  'use server';
  return runAction(async () => {
    const st = str(fd, 'status');
    await updateCase(await getCurrentUser(), id, { status: ['open', 'in_progress', 'resolved'].includes(st) ? (st as 'open') : undefined, assignToMe: bool(fd, 'assign'), note: str(fd, 'note') });
    revalidatePath(`/admin/support/${id}`);
  }, 'Case updated.');
}

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePerm('support.manage', '/admin/login');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let d;
  try {
    d = await caseDetail(user, id);
  } catch (e) {
    if (isDomainError(e)) notFound();
    throw e;
  }
  const tz = (await getSettings('restaurant')).timezone;
  const c = d.case as Record<string, string | null> & { createdAt: Date };
  const notes = d.notes as unknown as { id: string; note: string; authorName: string | null; createdAt: Date }[];
  return (
    <>
      <div className={`${C_ADMIN_TOP} admin-top`}><div><p className="muted" style={{ margin: 0 }}><Link href="/admin/support">Support</Link></p><h1>{c.caseNumber}</h1></div></div>
      <div className={C_TWO_COL}>
        <section className="panel stack">
          <dl className="kv">
            <dt>Opened</dt><dd>{formatLocalDateTime(c.createdAt, tz)}</dd>
            <dt>Customer</dt><dd>{c.contactName}</dd>
            <dt>Contact</dt><dd>{c.contactPhone && <a href={`tel:${c.contactPhone}`}>{c.contactPhone}</a>} {c.contactEmail}</dd>
            <dt>Problem</dt><dd>{String(c.category).replace(/_/g, ' ')}</dd>
            <dt>Order</dt><dd>{c.orderId ? <Link href={`/admin/orders/${c.orderId}`}>{c.orderNumber}</Link> : 'Not linked'}</dd>
            <dt>Status</dt><dd>{String(c.status).replace('_', ' ')}</dd>
          </dl>
          <blockquote style={{ margin: 0, padding: 12, background: 'var(--ivory)', borderRadius: 10 }}>{c.message}</blockquote>
          <h2 style={{ fontSize: '1.1rem' }}>Internal notes</h2>
          {notes.length === 0 ? <p className="muted">No notes yet.</p> : <ul className={C_EVENT_LIST}>{notes.map((n) => <li key={n.id}><span className="small muted">{formatLocalDateTime(n.createdAt, tz)}</span><span>{n.note} <span className="muted small">by {n.authorName}</span></span></li>)}</ul>}
        </section>
        <section className="panel">
          <ActionForm action={update.bind(null, id)} className="stack" resetOnSuccess>
            <div className="field"><label htmlFor="s-note">Add note</label><textarea id="s-note" name="note" className="textarea" maxLength={2000} /></div>
            <div className="field"><label htmlFor="s-st">Status</label><select id="s-st" name="status" className="select" defaultValue={c.status ?? 'open'}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></div>
            <label className="check"><input type="checkbox" name="assign" /> Assign to me</label>
            <SubmitButton>Update case</SubmitButton>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
