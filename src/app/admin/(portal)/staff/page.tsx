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
import { C_ADMIN_TOP, C_DSP_COUNT, C_DSP_HEAD, C_EMPTY_BOX, C_MENU_LAYOUT, C_MENU_SIDE, C_MENU_SIDE_CARD, C_SET_GROUP, C_SET_LABEL, C_TWO_COL, C_ZONE_GROUPS } from '@/components/ui';

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
      <div className={`${C_ADMIN_TOP} admin-top`}>
        <div>
          <h1>Staff</h1>
          <p className="muted" style={{ margin: 0 }}>{activeCount} active of {staff.length} accounts</p>
        </div>
      </div>
      <div className={`${C_TWO_COL} ${C_MENU_LAYOUT}`}>
        <section className="panel [padding:clamp(20px,_2.4vw,_30px)]">
          <div className={C_DSP_HEAD}><h2>Team <span className={C_DSP_COUNT}>{staff.length}</span></h2></div>
          {staff.length === 0 ? <p className={C_EMPTY_BOX}>No staff accounts yet.</p> : (
            <ul className="list-none m-0 p-0 grid [gap:14px]">
              {staff.map((s) => {
                const rl = s.roles.filter((x) => x !== 'customer');
                const locked = s.roles.includes('owner') && !user.roles.includes('owner');
                return (
                  <li key={s.id} className={`grid [grid-template-columns:48px_minmax(0,_1.3fr)_minmax(0,_1.2fr)_minmax(0,_1fr)_auto] [grid-template-areas:'av_info_roles_last_act'_'._more_more_more_more'] [gap:10px_18px] items-center [padding:20px_22px] [border:1px_solid_var(--line)] [border-radius:var(--r-md)] [background:var(--surface)] [&.inactive]:[opacity:0.7] max-[900px]:[grid-template-columns:48px_1fr_auto] max-[900px]:[grid-template-areas:'av_info_act'_'roles_roles_roles'_'last_last_last'_'more_more_more']${s.isActive ? '' : ' inactive'}`}>
                    <span className="[grid-area:av] [width:44px] [height:44px] rounded-[50%] grid place-items-center [background:var(--espresso)] [color:var(--ivory)] font-extrabold" aria-hidden="true">{s.fullName.trim().charAt(0).toUpperCase()}</span>
                    <div className="[grid-area:info] grid [gap:2px] [min-width:0] [overflow-wrap:anywhere]">
                      <strong>{s.fullName}</strong>
                      <span className="small muted">{s.email ?? s.phone}</span>
                    </div>
                    <div className="[grid-area:roles] flex flex-wrap [gap:6px]">
                      {!s.isActive && <Badge tone="neutral">Inactive</Badge>}
                      {rl.map((x) => <Badge key={x} tone={x === 'owner' ? 'info' : 'neutral'}>{ROLE_LABELS[x]}</Badge>)}
                    </div>
                    <div className="[grid-area:last] grid [gap:2px]">
                      <span className="small muted">Last sign-in</span>
                      <span className="small">{s.lastLoginAt ? formatLocalDateTime(s.lastLoginAt, r.timezone) : 'Never'}</span>
                    </div>
                    <div className="[grid-area:act]">
                      {s.id !== user.id && !locked && <ActionButton className="btn sm ghost" action={activeAction.bind(null, s.id, !s.isActive)} confirm={s.isActive ? `Deactivate ${s.fullName}? They will be signed out immediately.` : undefined}>{s.isActive ? 'Deactivate' : 'Reactivate'}</ActionButton>}
                    </div>
                    {locked ? <div className="[grid-area:more] flex flex-wrap [gap:8px_28px] [padding-top:10px] [border-top:1px_solid_var(--line)] [&_details]:[min-width:220px] [&_details[open]]:[flex-basis:100%] [&_.stack]:[margin-top:10px] [&_.stack]:[max-width:420px]"><span className="small muted">Only an owner can change this account.</span></div> : (
                    <div className="[grid-area:more] flex flex-wrap [gap:8px_28px] [padding-top:10px] [border-top:1px_solid_var(--line)] [&_details]:[min-width:220px] [&_details[open]]:[flex-basis:100%] [&_.stack]:[margin-top:10px] [&_.stack]:[max-width:420px]">
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
        <aside className={C_MENU_SIDE}>
          <section className={`panel ${C_MENU_SIDE_CARD} menu-side-card`}>
            <h2>Add a staff member</h2>
            <ActionForm action={createAction} className={`${C_ZONE_GROUPS} zone-groups`} resetOnSuccess>
              <div className={`${C_SET_GROUP} set-group`}>
                <div className={C_SET_LABEL}>Who</div>
                <div className="field"><label htmlFor="st-n">Full name</label><input id="st-n" name="name" className="input" required maxLength={80} /></div>
                <div className="field"><label htmlFor="st-e">Email</label><input id="st-e" name="email" type="email" className="input" /></div>
                <div className="field"><label htmlFor="st-p">Phone</label><input id="st-p" name="phone" type="tel" className="input" placeholder="Riders can sign in with phone" /></div>
              </div>
              <div className={`${C_SET_GROUP} set-group`}>
                <div className={C_SET_LABEL}>Roles</div>
                <RoleChoice options={grantable.map((x) => ({ value: x, label: ROLE_LABELS[x] }))} />
              </div>
              <div className={`${C_SET_GROUP} set-group`}>
                <div className={C_SET_LABEL}>Sign-in</div>
                <div className="field"><label htmlFor="st-pw">Temporary password</label><RevealPassword id="st-pw" /></div>
              </div>
              <SubmitButton>Create account</SubmitButton>
            </ActionForm>
          </section>
          <section className={`panel ${C_MENU_SIDE_CARD} menu-side-card`}>
            <h2>What each role can do</h2>
            {STAFF_ROLES.map((x) => (
              <details key={x} className="[border:1px_solid_var(--line,_var(--border))] [border-radius:12px] [padding:0_16px] [margin-bottom:10px] [&_>_summary]:[padding:14px_0] [&_>_summary]:font-bold [&_>_summary]:cursor-pointer [&[open]_>_summary]:[border-bottom:1px_solid_var(--line,_var(--border))] [&[open]_>_summary]:[margin-bottom:14px] [&_.stack]:[padding-bottom:16px]">
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
