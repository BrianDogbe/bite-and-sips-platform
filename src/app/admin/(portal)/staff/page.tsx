import { revalidatePath } from 'next/cache';
import { requirePagePerm, getCurrentUser } from '@/server/auth/current';
import { listStaff, createStaff, setStaffRoles, setStaffActive, resetStaffPassword } from '@/server/staff';
import { STAFF_ROLES, ROLE_LABELS, ROLE_PERMISSIONS, canGrantRole, type Role } from '@/server/auth/permissions';
import { getSettings } from '@/server/settings';
import { runAction, str } from '@/server/action';
import { formatLocalDateTime } from '@/lib/time';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { ActionButton } from '@/components/ActionButton';
import { Badge } from '@/components/Badge';
import { RevealPassword } from '@/components/admin/RevealPassword';
import { RoleChoice } from '@/components/admin/RoleChoice';
import type { ActionResult } from '@/lib/action-result';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Staff' };

const roles = (fd: FormData) => fd.getAll('roles').map(String).filter((r): r is Role => (STAFF_ROLES as string[]).includes(r));

async function createAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  'use server';
  return runAction(async () => {
    await createStaff(await getCurrentUser(), { fullName: str(fd, 'name'), email: str(fd, 'email') || null, phone: str(fd, 'phone') || null, roles: roles(fd), password: str(fd, 'password') });
    revalidatePath('/admin/staff');
  }, 'Staff account created. Share the temporary password privately and ask them to change it.');
}
async function rolesAction(id: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  'use server';
  return runAction(async () => {
    await setStaffRoles(await getCurrentUser(), id, roles(fd));
    revalidatePath('/admin/staff');
  }, 'Roles updated. Their sessions were signed out if access was removed.');
}
async function activeAction(id: string, active: boolean): Promise<ActionResult> {
  'use server';
  return runAction(async () => {
    await setStaffActive(await getCurrentUser(), id, active);
    revalidatePath('/admin/staff');
  }, active ? 'Reactivated.' : 'Deactivated and signed out.');
}
async function resetAction(id: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  'use server';
  return runAction(async () => {
    await resetStaffPassword(await getCurrentUser(), id, str(fd, 'password'));
  }, 'Password reset. All their sessions were signed out.');
}

export default async function Staff() {
  const user = await requirePagePerm('staff.manage', '/admin/login');
  const [staff, r] = await Promise.all([listStaff(user), getSettings('restaurant')]);
  const grantable = STAFF_ROLES.filter((x) => canGrantRole(user.roles, x));
  const activeCount = staff.filter((x) => x.isActive).length;
  return (
    <>
      <div className="admin-top">
        <div>
          <h1>Staff</h1>
          <p className="muted" style={{ margin: 0 }}>{activeCount} active of {staff.length} accounts</p>
        </div>
      </div>
      <div className="two-col menu-layout">
        <section className="panel staff-panel">
          <div className="dsp-head"><h2>Team <span className="dsp-count">{staff.length}</span></h2></div>
          {staff.length === 0 ? <p className="empty-box">No staff accounts yet.</p> : (
            <ul className="staff-list">
              {staff.map((s) => {
                const rl = s.roles.filter((x) => x !== 'customer');
                const locked = s.roles.includes('owner') && !user.roles.includes('owner');
                return (
                  <li key={s.id} className={`staff-row${s.isActive ? '' : ' inactive'}`}>
                    <span className="staff-avatar" aria-hidden="true">{s.fullName.trim().charAt(0).toUpperCase()}</span>
                    <div className="staff-info">
                      <strong>{s.fullName}</strong>
                      <span className="small muted">{s.email ?? s.phone}</span>
                    </div>
                    <div className="staff-roles">
                      {!s.isActive && <Badge tone="neutral">Inactive</Badge>}
                      {rl.map((x) => <Badge key={x} tone={x === 'owner' ? 'info' : 'neutral'}>{ROLE_LABELS[x]}</Badge>)}
                    </div>
                    <div className="staff-last">
                      <span className="small muted">Last sign-in</span>
                      <span className="small">{s.lastLoginAt ? formatLocalDateTime(s.lastLoginAt, r.timezone) : 'Never'}</span>
                    </div>
                    <div className="staff-actions">
                      {s.id !== user.id && !locked && <ActionButton className="btn sm ghost" action={activeAction.bind(null, s.id, !s.isActive)} confirm={s.isActive ? `Deactivate ${s.fullName}? They will be signed out immediately.` : undefined}>{s.isActive ? 'Deactivate' : 'Reactivate'}</ActionButton>}
                    </div>
                    {locked ? <div className="staff-more"><span className="small muted">Only an owner can change this account.</span></div> : (
                    <div className="staff-more">
                      <details>
                        <summary className="linkish small">Edit roles</summary>
                        <ActionForm action={rolesAction.bind(null, s.id)} className="stack">
                          <RoleChoice options={STAFF_ROLES.map((x) => ({ value: x, label: ROLE_LABELS[x], locked: !grantable.includes(x) }))} selected={s.roles.filter((x) => x !== 'customer')} />
                          <SubmitButton className="btn sm">Save roles</SubmitButton>
                        </ActionForm>
                      </details>
                      <details>
                        <summary className="linkish small">Reset password</summary>
                        <ActionForm action={resetAction.bind(null, s.id)} className="stack" resetOnSuccess>
                          <RevealPassword placeholder="New temporary password" label="New password" />
                          <SubmitButton className="btn sm">Reset</SubmitButton>
                        </ActionForm>
                      </details>
                    </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <aside className="menu-side">
          <section className="panel menu-side-card">
            <h2>Add a staff member</h2>
            <ActionForm action={createAction} className="zone-groups" resetOnSuccess>
              <div className="set-group">
                <div className="set-label">Who</div>
                <div className="field"><label htmlFor="st-n">Full name</label><input id="st-n" name="name" className="input" required maxLength={80} /></div>
                <div className="field"><label htmlFor="st-e">Email</label><input id="st-e" name="email" type="email" className="input" /></div>
                <div className="field"><label htmlFor="st-p">Phone</label><input id="st-p" name="phone" type="tel" className="input" placeholder="Riders can sign in with phone" /></div>
              </div>
              <div className="set-group">
                <div className="set-label">Roles</div>
                <RoleChoice options={grantable.map((x) => ({ value: x, label: ROLE_LABELS[x] }))} />
              </div>
              <div className="set-group">
                <div className="set-label">Sign-in</div>
                <div className="field"><label htmlFor="st-pw">Temporary password</label><RevealPassword id="st-pw" /></div>
              </div>
              <SubmitButton>Create account</SubmitButton>
            </ActionForm>
          </section>
          <section className="panel menu-side-card">
            <h2>What each role can do</h2>
            {STAFF_ROLES.map((x) => (
              <details key={x} className="menu-edit">
                <summary>{ROLE_LABELS[x]}</summary>
                <p className="small muted">{ROLE_PERMISSIONS[x].join(', ')}</p>
              </details>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
