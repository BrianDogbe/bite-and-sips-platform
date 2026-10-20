import { requirePagePerm } from '@/server/auth/current';
import { listPromotions, savePromotion } from '@/server/ops';
import { getCurrentUser } from '@/server/auth/current';
import { runAction, str, bool, int } from '@/server/action';
import { parseCedisToPesewas, formatGHS } from '@/lib/money';
import { formatLocalDateTime } from '@/lib/time';
import { getSettings } from '@/server/settings';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { Badge } from '@/components/Badge';
import { revalidatePath } from 'next/cache';
import { invalid } from '@/server/errors';
import type { ActionResult } from '@/lib/action-result';
import { C_ADMIN_TOP, C_CASES_TABLE, C_CHECK_CARD, C_DSP_COUNT, C_DSP_EMPTY, C_DSP_HEAD, C_FORM_ALIGNED, C_SET_GROUP, C_SET_LABEL, C_TWO_COL, C_ZONES_LAYOUT, C_ZONE_GROUPS } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Promotions' };

async function savePromo(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  'use server';
  return runAction(async () => {
    const type = str(fd, 'discountType') === 'fixed' ? 'fixed' : 'percent';
    const value = type === 'fixed' ? parseCedisToPesewas(str(fd, 'value')) : int(fd, 'value');
    if (!value || value <= 0) throw invalid('Enter a discount value.');
    const minSub = str(fd, 'minSubtotal') ? parseCedisToPesewas(str(fd, 'minSubtotal')) : 0;
    const maxDisc = str(fd, 'maxDiscount') ? parseCedisToPesewas(str(fd, 'maxDiscount')) : null;
    const toIso = (k: string) => (str(fd, k) ? new Date(str(fd, k)).toISOString() : null);
    await savePromotion(await getCurrentUser(), {
      id: int(fd, 'id') ?? undefined,
      code: str(fd, 'code'),
      description: str(fd, 'description') || null,
      discountType: type,
      discountValue: value,
      minSubtotalPesewas: minSub ?? 0,
      maxDiscountPesewas: maxDisc,
      startsAt: toIso('startsAt'),
      endsAt: toIso('endsAt'),
      usageLimit: int(fd, 'usageLimit'),
      isActive: bool(fd, 'isActive'),
    });
    revalidatePath('/admin/promotions');
  }, 'Promotion saved.');
}

export default async function Promotions() {
  await requirePagePerm('menu.manage', '/admin/login');
  const [promos, r] = await Promise.all([listPromotions(), getSettings('restaurant')]);
  const rows = promos as unknown as { id: number; code: string; description: string | null; discountType: string; discountValue: number; minSubtotalPesewas: number; maxDiscountPesewas: number | null; startsAt: Date | null; endsAt: Date | null; usageLimit: number | null; usedCount: number; isActive: boolean }[];
  return (
    <>
      <div className={`${C_ADMIN_TOP} admin-top`}>
        <div>
          <h1>Promotions</h1>
          <p className="muted" style={{ margin: 0 }}>Promo codes customers can enter at checkout.</p>
        </div>
      </div>
      <div className={`${C_TWO_COL} ${C_ZONES_LAYOUT}`}>
        <section className="panel">
          <h2 className={C_DSP_HEAD}>
            Promo codes <span className={C_DSP_COUNT}>{rows.length}</span>
          </h2>
          {rows.length === 0 ? (
            <p className={C_DSP_EMPTY}>No promo codes yet.</p>
          ) : (
            <div className="table-wrap">
              <table className={`data ${C_CASES_TABLE}`}>
                <thead>
                  <tr><th>Code</th><th>Discount</th><th>Window</th><th>Used</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.code}</strong><div className="small muted">{p.description}</div></td>
                      <td>{p.discountType === 'percent' ? `${p.discountValue}%` : formatGHS(p.discountValue)}{p.minSubtotalPesewas ? <div className="small muted">min {formatGHS(p.minSubtotalPesewas)}</div> : null}</td>
                      <td className="small">{p.startsAt ? formatLocalDateTime(p.startsAt, r.timezone) : 'Any time'} – {p.endsAt ? formatLocalDateTime(p.endsAt, r.timezone) : 'no end'}</td>
                      <td>{p.usedCount}{p.usageLimit ? ` / ${p.usageLimit}` : ''}</td>
                      <td><Badge tone={p.isActive ? 'ok' : 'neutral'}>{p.isActive ? 'Active' : 'Off'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel">
          <h2 className={C_DSP_HEAD}>New promo code</h2>
          <ActionForm action={savePromo} className="stack" resetOnSuccess>
            <div className={`${C_ZONE_GROUPS} zone-groups`}>
              <div className={`${C_SET_GROUP} set-group`}>
                <p className={C_SET_LABEL}>Code</p>
                <div className="field"><label htmlFor="p-code">Code</label><input id="p-code" name="code" className="input" required maxLength={30} style={{ textTransform: 'uppercase' }} /></div>
                <div className="field"><label htmlFor="p-desc">Description shown to customers</label><input id="p-desc" name="description" className="input" maxLength={200} /></div>
              </div>
              <div className={`${C_SET_GROUP} set-group`}>
                <p className={C_SET_LABEL}>Discount</p>
                <div className={`${C_FORM_ALIGNED} two`}>
                  <div className="field"><label htmlFor="p-type">Type</label><select id="p-type" name="discountType" className="select"><option value="percent">Percent off</option><option value="fixed">Amount off (GH₵)</option></select></div>
                  <div className="field"><label htmlFor="p-val">Value</label><input id="p-val" name="value" className="input" required inputMode="decimal" placeholder="10" /></div>
                  <div className="field"><label htmlFor="p-min">Minimum order (GH₵)</label><input id="p-min" name="minSubtotal" className="input" inputMode="decimal" /></div>
                  <div className="field"><label htmlFor="p-max">Maximum discount (GH₵)</label><input id="p-max" name="maxDiscount" className="input" inputMode="decimal" /></div>
                </div>
              </div>
              <div className={`${C_SET_GROUP} set-group`}>
                <p className={C_SET_LABEL}>When it works</p>
                <div className={`${C_FORM_ALIGNED} two`}>
                  <div className="field"><label htmlFor="p-s">Starts</label><input id="p-s" name="startsAt" type="datetime-local" className="input" /></div>
                  <div className="field"><label htmlFor="p-e">Ends</label><input id="p-e" name="endsAt" type="datetime-local" className="input" /></div>
                  <div className="field"><label htmlFor="p-lim">Total uses allowed</label><input id="p-lim" name="usageLimit" type="number" min={1} className="input" /></div>
                </div>
              </div>
              <label className={`check ${C_CHECK_CARD}`}>
                <input type="checkbox" name="isActive" defaultChecked />
                <span>
                  Active
                  <span className="hint" style={{ display: 'block' }}>Customers can use the code while it is active.</span>
                </span>
              </label>
            </div>
            <SubmitButton className="btn primary">Save promotion</SubmitButton>
          </ActionForm>
          <p className="hint" style={{ marginTop: 8 }}>Dates use this device’s timezone. The restaurant runs on {r.timezone}.</p>
        </section>
      </div>
    </>
  );
}
