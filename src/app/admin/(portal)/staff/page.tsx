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
  return (
    <>
      <div className="admin-top"><h1>Staff</h1></div>
      <div className="two-col">
        <section className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Name</th><th>Roles</th><th>Last sign-in</th><th /></tr></thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.fullName}</strong> {!s.isActive && <Badge tone="neutral">Inactive</Badge>}<div className="small muted">{s.email ?? s.phone}</div></td>
                    <td>
                      <details>
                        <summary>{s.roles.filter((x) => x !== 'customer').map((x) => ROLE_LABELS[x]).join(', ')}</summary>
                        <ActionForm action={rolesAction.bind(null, s.id)} className="stack">
                          {STAFF_ROLES.map((x) => (
                            <label key={x} className="check small"><input type="checkbox" name="roles" value={x} defaultChecked={s.roles.includes(x)} disabled={!grantable.includes(x)} /> {ROLE_LABELS[x]}</label>
                          ))}
                          <SubmitButton className="btn sm">Save roles</SubmitButton>
                        </ActionForm>
                      </details>
                    </td>
                    <td className="small">{s.lastLoginAt ? formatLocalDateTime(s.lastLoginAt, r.timezone) : 'Never'}</td>
                    <td className="nowrap">
                      {s.id !== user.id && <ActionButton className="btn sm" action={activeAction.bind(null, s.id, !s.isActive)} confirm={s.isActive ? `Deactivate ${s.fullName}? They will be signed out immediately.` : undefined}>{s.isActive ? 'Deactivate' : 'Reactivate'}</ActionButton>}
                      <details>
                        <summary className="linkish small">Reset password</summary>
                        <ActionForm action={resetAction.bind(null, s.id)} className="stack" resetOnSuccess>
                          <input name="password" type="password" className="input" minLength={10} required placeholder="New temporary password" aria-label="New password" autoComplete="new-password" />
                          <SubmitButton className="btn sm">Reset</SubmitButton>
                        </ActionForm>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="stack" style={{ ['--stack' as string]: '18px' }}>
          <section className="panel">
            <h2 style={{ fontSize: '1.15rem' }}>Add a staff member</h2>
            <ActionForm action={createAction} className="stack" resetOnSuccess>
              <div className="field"><label htmlFor="st-n">Full name</label><input id="st-n" name="name" className="input" required maxLength={80} /></div>
              <div className="field"><label htmlFor="st-e">Email</label><input id="st-e" name="email" type="email" className="input" /></div>
              <div className="field"><label htmlFor="st-p">Phone</label><input id="st-p" name="phone" type="tel" className="input" placeholder="Riders can sign in with phone" /></div>
              <fieldset className="optgroup" style={{ margin: 0 }}>
                <legend>Roles</legend>
                {grantable.map((x) => <label key={x} className="check small"><input type="checkbox" name="roles" value={x} /> {ROLE_LABELS[x]}</label>)}
              </fieldset>
              <div className="field"><label htmlFor="st-pw">Temporary password</label><input id="st-pw" name="password" type="password" className="input" minLength={10} required autoComplete="new-password" /></div>
              <SubmitButton>Create account</SubmitButton>
            </ActionForm>
          </section>
          <section className="panel">
            <h2 style={{ fontSize: '1.15rem' }}>What each role can do</h2>
            {STAFF_ROLES.map((x) => (
              <details key={x}>
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
