import { revalidatePath } from 'next/cache';
import { requirePagePerm, getCurrentUser } from '@/server/auth/current';
import { getSettings } from '@/server/settings';
import { riderCashBalances, recordCashHandover } from '@/server/fulfillment/inhouse';
import { runAction, str } from '@/server/action';
import { formatGHS, parseCedisToPesewas, pesewasToCedisString } from '@/lib/money';
import { invalid } from '@/server/errors';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { DispatchBoard } from '@/components/admin/DispatchBoard';
import type { ActionResult } from '@/lib/action-result';
import { C_ADMIN_TOP, C_DSP_COUNT, C_DSP_HEAD } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dispatch' };

async function handInAction(riderId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  'use server';
  return runAction(async () => {
    const amount = parseCedisToPesewas(str(fd, 'amount'));
    if (!amount) throw invalid('Enter the amount received in cedis.');
    await recordCashHandover(await getCurrentUser(), riderId, amount, str(fd, 'note') || null);
    revalidatePath('/admin/dispatch');
  }, 'Cash hand-in recorded.');
}

export default async function DispatchPage() {
  const user = await requirePagePerm('dispatch.manage', '/admin/login');
  const tz = (await getSettings('restaurant')).timezone;
  const owing = user.permissions.has('cash.collect') ? (await riderCashBalances(user)).filter((r) => r.balancePesewas > 0) : [];
  return (
    <>
      <div className={`${C_ADMIN_TOP} admin-top`}>
        <h1>Dispatch</h1>
      </div>
      {owing.length > 0 && (
        <section className="panel grid [gap:12px] [margin-bottom:16px] rider-cash">
          <div className={C_DSP_HEAD}>
            <h2>Rider cash to collect <span className={C_DSP_COUNT}>{owing.length}</span></h2>
          </div>
          <p className="muted small" style={{ margin: 0 }}>Cash riders have collected from customers and not yet handed in. Record it when you receive it.</p>
          <ul className="list-none m-0 p-0 grid [gap:10px] [&_li]:flex [&_li]:flex-wrap [&_li]:items-center [&_li]:justify-between [&_li]:[gap:12px] [&_li]:[padding:12px_14px] [&_li]:[background:var(--ivory-2)] [&_li]:[border:1px_solid_var(--line)] [&_li]:[border-radius:12px] [&_li_>_div:first-child]:grid [&_li_>_div:first-child]:[gap:2px]">
            {owing.map((r) => (
              <li key={r.riderUserId}>
                <div>
                  <strong>{r.fullName}</strong>
                  <span className="small muted">Holding {formatGHS(r.balancePesewas)}</span>
                </div>
                <ActionForm action={handInAction.bind(null, r.riderUserId)} className="flex flex-wrap items-center [gap:8px] [&_.input]:[width:130px] [&_.input[name=note]]:[width:200px]" resetOnSuccess>
                  <input name="amount" className="input" inputMode="decimal" aria-label={`Amount received from ${r.fullName}`} defaultValue={pesewasToCedisString(r.balancePesewas)} required />
                  <input name="note" className="input" placeholder="Note (optional)" aria-label="Note" maxLength={200} />
                  <SubmitButton className="btn sm">Record hand-in</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      )}
      <DispatchBoard timezone={tz} />
    </>
  );
}
