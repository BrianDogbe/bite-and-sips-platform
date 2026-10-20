import { requirePagePerm, getCurrentUser } from '@/server/auth/current';
import { changeOwnPassword } from '@/server/staff';
import { runAction, str } from '@/server/action';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import type { ActionResult } from '@/lib/action-result';
import { C_ADMIN_TOP } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your account' };

async function changePw(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  'use server';
  return runAction(async () => {
    await changeOwnPassword(await getCurrentUser(), str(fd, 'current'), str(fd, 'next'));
  }, 'Password changed. Other devices have been signed out.');
}

export default async function AccountPage() {
  const user = await requirePagePerm(['dashboard.view', 'menu.manage', 'dispatch.manage', 'orders.view'], '/admin/login');
  return (
    <>
      <div className={`${C_ADMIN_TOP} admin-top`}><h1>Your account</h1></div>
      <section className="panel" style={{ maxWidth: 480 }}>
        <p>{user.fullName} ({user.email ?? user.phone})</p>
        <ActionForm action={changePw} className="stack" resetOnSuccess>
          <div className="field"><label htmlFor="cp-c">Current password</label><input id="cp-c" name="current" type="password" className="input" required autoComplete="current-password" /></div>
          <div className="field"><label htmlFor="cp-n">New password</label><input id="cp-n" name="next" type="password" className="input" required minLength={10} autoComplete="new-password" /></div>
          <SubmitButton>Change password</SubmitButton>
        </ActionForm>
      </section>
    </>
  );
}
