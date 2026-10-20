import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { requirePagePerm, getCurrentUser } from '@/server/auth/current';
import { financeSummary, paymentsList, listExpenses, addExpense, removeExpense, METRIC_DEFINITIONS } from '@/server/reporting';
import { reconcileAttempt } from '@/server/payments/service';
import { getSettings } from '@/server/settings';
import { resolvePeriod } from '@/server/period';
import { runAction, str } from '@/server/action';
import { formatGHS, parseCedisToPesewas } from '@/lib/money';
import { formatLocalDateTime, formatLocalDate } from '@/lib/time';
import { Badge } from '@/components/Badge';
import { PeriodPicker } from '@/components/admin/PeriodPicker';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { ActionButton } from '@/components/ActionButton';
import { invalid } from '@/server/errors';
import type { ActionResult } from '@/lib/action-result';
import { C_ADMIN_TOP, C_CASES_TABLE, C_DSP_COUNT, C_DSP_EMPTY, C_DSP_HEAD, C_EMPTY_BOX, C_EVENT_LIST, C_FORM_ALIGNED, C_KPI, C_SET_GROUP, C_SET_LABEL, C_SET_STATUS, C_TWO_COL, C_ZONE_GROUPS } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Finance' };

async function expenseAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  'use server';
  return runAction(async () => {
    const amount = parseCedisToPesewas(str(fd, 'amount'));
    if (!amount) throw invalid('Enter an amount in cedis.');
    await addExpense(await getCurrentUser(), { incurredOn: str(fd, 'date'), category: str(fd, 'category'), description: str(fd, 'description') || null, amountPesewas: amount });
    revalidatePath('/admin/finance');
  }, 'Expense recorded.');
}

async function removeExpenseAction(id: number): Promise<ActionResult> {
  'use server';
  return runAction(async () => {
    await removeExpense(await getCurrentUser(), id);
    revalidatePath('/admin/finance');
  }, 'Expense removed.');
}

async function reconcileAction(attemptId: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  'use server';
  return runAction(async () => {
    const settled = str(fd, 'settled') ? parseCedisToPesewas(str(fd, 'settled')) : null;
    await reconcileAttempt(await getCurrentUser(), attemptId, { status: str(fd, 'status') === 'discrepancy' ? 'discrepancy' : 'matched', settledAmountPesewas: settled, note: str(fd, 'note') || undefined });
    revalidatePath('/admin/finance');
  }, 'Reconciled.');
}

function Row({ label, value, def, strong, neg }: { label: string; value: string; def?: string; strong?: boolean; neg?: boolean }) {
  return (
    <tr className={strong ? '[.fin-table_tr&_td]:[background:var(--ivory-2)]' : undefined} title={def}>
      <td>
        {strong ? <strong>{label}</strong> : label}
        {def && <div className="small muted hidden [margin-top:4px] [max-width:62ch] [.fin-defs-toggle:checked_~_.fin-group_&]:block">{def}</div>}
      </td>
      <td className="num" style={{ fontWeight: strong ? 700 : undefined }}>
        {neg && /^GH/.test(value) ? '−' : ''}
        {value}
      </td>
    </tr>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="[margin-bottom:18px] fin-group">
      <div className={C_SET_LABEL}>{title}</div>
      <div className="table-wrap">
        <table className="data [&_td]:[padding:11px_6px] fin-table">
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function payTone(status: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (status === 'successful') return 'ok';
  if (status === 'failed') return 'danger';
  if (status === 'pending' || status === 'initiated') return 'warn';
  return 'neutral';
}

export default async function Finance({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePagePerm('finance.view', '/admin/login');
  const tz = (await getSettings('restaurant')).timezone;
  const p = resolvePeriod(await searchParams, tz);
  const [s, payments, expenses] = await Promise.all([financeSummary(user, p.from, p.to), user.permissions.has('payments.view') ? paymentsList(user, p.from, p.to) : Promise.resolve([]), listExpenses(user, p.from, p.to)]);
  const D = METRIC_DEFINITIONS;
  const range = `${formatLocalDate(p.from, tz)} to ${formatLocalDate(new Date(p.to.getTime() - 1), tz)}`;
  const net = s.netPaidSales;
  const parts = [
    { key: 'fees', label: 'Payment fees', v: s.paymentFees ?? 0, cls: 'c1' },
    { key: 'delivery', label: 'Delivery costs', v: s.deliveryCosts, cls: 'c2' },
    { key: 'ingredients', label: 'Ingredients (est.)', v: s.ingredientCostEstimate ?? 0, cls: 'c3' },
    { key: 'expenses', label: 'Other expenses', v: s.expenses, cls: 'c4' },
  ];
  const costTotal = parts.reduce((a, x) => a + x.v, 0);
  const left = Math.max(net - costTotal, 0);
  const base = Math.max(net, costTotal, 1);
  const pct = (v: number) => `${Math.max((v / base) * 100, 0).toFixed(2)}%`;
  const okPay = payments.filter((a) => a.status === 'successful' && !a.isTest);
  const pendingPay = payments.filter((a) => a.status === 'pending' || a.status === 'initiated');
  const failedPay = payments.filter((a) => a.status === 'failed');
  return (
    <>
      <div className={`${C_ADMIN_TOP} admin-top`}>
        <div>
          <h1>Finance</h1>
          <p className="muted" style={{ margin: 0 }}>{range}</p>
        </div>
        <div className="row">
          <a className="btn sm" href={`/api/admin/export?type=payments&from=${p.fromKey}&to=${p.toKey}`}>Export payments CSV</a>
          <a className="btn sm" href={`/api/admin/export?type=orders&from=${p.fromKey}&to=${p.toKey}`}>Export orders CSV</a>
        </div>
      </div>
      <PeriodPicker {...p} />
      <p className="alert info small">This is an operational summary, not an accounting system. Settlement amounts from the payment provider may differ from payments received; reconcile them below. Test orders are excluded.</p>
      <div className="grid [grid-template-columns:repeat(auto-fit,_minmax(170px,_1fr))] [gap:12px] [grid-template-columns:repeat(4,_minmax(0,_1fr))] [gap:16px] max-[1100px]:[grid-template-columns:repeat(2,_minmax(0,_1fr))] ov-kpis [margin-bottom:28px]">
        <div className={C_KPI}>
          <div className="v">{formatGHS(s.paidSales)}</div>
          <div className="l">Paid sales ({s.paidOrders} orders)</div>
        </div>
        <div className={C_KPI}>
          <div className="v">{formatGHS(s.netPaidSales)}</div>
          <div className="l">Net paid sales</div>
        </div>
        <div className={C_KPI}>
          <div className="v">{formatGHS(s.contributionEstimate)}</div>
          <div className="l">Estimated contribution</div>
        </div>
        <div className={C_KPI}>
          <div className="v">{s.aov != null ? formatGHS(s.aov) : 'n/a'}</div>
          <div className="l">Average paid order</div>
        </div>
      </div>
      <section className="panel [padding:clamp(20px,_2.4vw,_30px)] [margin-bottom:24px]">
        <div className="flex items-baseline justify-between [gap:12px] flex-wrap [margin-bottom:16px] [&_h2]:m-0 [&_h2]:[font-size:1.15rem]">
          <h2>Where the money goes</h2>
          <span className="muted small">Share of net paid sales ({formatGHS(net)})</span>
        </div>
        {net <= 0 && costTotal <= 0 ? (
          <p className={C_EMPTY_BOX}>No paid sales in this period yet.</p>
        ) : (
          <>
            <div className="flex [height:22px] rounded-full overflow-hidden [background:var(--ivory-2)] [border:1px_solid_var(--line)]" role="img" aria-label="Costs and remaining contribution as a share of net paid sales">
              {parts.map((x) => x.v > 0 && <span key={x.key} className={`[height:100%] [&.c1]:[background:var(--caramel-text)] [&.c2]:[background:var(--espresso-2)] [&.c3]:[background:#b98a5e] [&.c4]:[background:#8a7b70] [&.left]:[background:var(--sage-dark)] ${x.cls}`} style={{ width: pct(x.v) }} />)}
              {left > 0 && <span className="[height:100%] [&.c1]:[background:var(--caramel-text)] [&.c2]:[background:var(--espresso-2)] [&.c3]:[background:#b98a5e] [&.c4]:[background:#8a7b70] [&.left]:[background:var(--sage-dark)] left" style={{ width: pct(left) }} />}
            </div>
            <ul className="list-none [margin:18px_0_0] p-0 grid [grid-template-columns:repeat(auto-fit,_minmax(210px,_1fr))] [gap:12px_24px] [&_li]:grid [&_li]:[grid-template-columns:auto_1fr] [&_li]:[column-gap:10px] [&_li]:items-center [&_li_strong]:[grid-column:2] [&_li_strong]:[font-size:1.05rem]">
              {parts.map((x) => (
                <li key={x.key}><i className={`[&.c1]:[background:var(--caramel-text)] [&.c2]:[background:var(--espresso-2)] [&.c3]:[background:#b98a5e] [&.c4]:[background:#8a7b70] [&.left]:[background:var(--sage-dark)] [width:12px] [height:12px] rounded-[50%] [grid-row:span_2] ${x.cls}`} /><span>{x.label}</span><strong className="tnum">{formatGHS(x.v)}</strong></li>
              ))}
              <li><i className="[&.c1]:[background:var(--caramel-text)] [&.c2]:[background:var(--espresso-2)] [&.c3]:[background:#b98a5e] [&.c4]:[background:#8a7b70] [&.left]:[background:var(--sage-dark)] [width:12px] [height:12px] rounded-[50%] [grid-row:span_2] left" /><span>Left over (estimate)</span><strong className="tnum">{formatGHS(left)}</strong></li>
            </ul>
          </>
        )}
      </section>
      <div className={`${C_TWO_COL} [gap:24px] [align-items:start] [margin-bottom:28px]`}>
        <section className="panel [padding:clamp(20px,_2.4vw,_30px)] [&_h2]:[font-size:1.15rem] [&_h2]:[margin-bottom:16px]">
          <input type="checkbox" id="fin-defs" className="fin-defs-toggle sr-only" />
          <div className="flex items-center justify-between [gap:12px] [margin-bottom:16px] [&_h2]:m-0 fin-summary-head">
            <h2>Summary</h2>
            <label htmlFor="fin-defs" className="btn sm ghost [.fin-defs-toggle:focus-visible_~_.fin-summary-head_&]:[background:var(--ivory-2)] [.fin-defs-toggle:focus-visible_~_.fin-summary-head_&]:[border-color:var(--line-strong)] [.fin-defs-toggle:checked_~_.fin-summary-head_&]:[background:var(--ivory-2)] [.fin-defs-toggle:checked_~_.fin-summary-head_&]:[border-color:var(--line-strong)]">Explain each line</label>
          </div>
          <Group title="Sales">
            <Row label="Gross order value" value={formatGHS(s.grossOrderValue)} def={D.grossOrderValue} />
            <Row label="Discounts given" value={formatGHS(s.discounts)} def={D.discounts} />
            <Row label="Delivery fees charged" value={formatGHS(s.deliveryFeesCharged)} def={D.deliveryFeesCharged} />
            <Row label="Paid sales" value={formatGHS(s.paidSales)} def={`${D.paidSales} (${s.paidOrders} orders)`} strong />
            <Row label="Refunds processed" value={formatGHS(s.refunds)} def={D.refunds} neg />
            <Row label="Net paid sales" value={formatGHS(s.netPaidSales)} def={D.netPaidSales} strong />
          </Group>
          <Group title="Costs">
            <Row label="Payment processing fees" value={s.paymentFees != null ? formatGHS(s.paymentFees) : 'Not reported'} def={`${D.paymentFees} Reported for ${s.paymentFeesComplete} of ${s.paidOrders} payments.`} neg />
            <Row label="Delivery costs" value={formatGHS(s.deliveryCosts)} def={D.deliveryCosts} neg />
            <Row label="Ingredient cost (estimate)" value={s.ingredientCostEstimate != null ? formatGHS(s.ingredientCostEstimate) : 'No recipe costing'} def={D.ingredientCostEstimate} neg />
            <Row label="Other expenses recorded" value={formatGHS(s.expenses)} def={D.expenses} />
          </Group>
          <Group title="Result">
            <Row label="Estimated contribution" value={formatGHS(s.contributionEstimate)} def={D.contributionEstimate} strong />
          </Group>
          <p className={`${C_SET_STATUS} small`}>
            Orders placed: {s.placedOrders}. Cancelled: {s.cancelledOrders}. Average paid order: {s.aov != null ? formatGHS(s.aov) : 'n/a'}.
          </p>
          {s.unreconciledPayments > 0 && <p className="alert warn small">{s.unreconciledPayments} successful payment(s) ({formatGHS(s.unreconciledAmount)}) are not yet reconciled against provider settlements.</p>}
        </section>
        <aside className="[&_.panel]:[padding:clamp(20px,_2.4vw,_30px)] [&_h2]:[font-size:1.15rem] [&_h2]:[margin-bottom:16px] grid [gap:24px]">
          {user.permissions.has('finance.manage') && (
          <section className="panel">
            <h2>Record an expense</h2>
            <ActionForm action={expenseAction} className={`${C_ZONE_GROUPS} zone-groups`} resetOnSuccess>
              <div className={`${C_SET_GROUP} set-group`}>
                <div className={C_SET_LABEL}>When and how much</div>
                <div className={`${C_FORM_ALIGNED} two`}>
                  <div className="field"><label htmlFor="e-d">Date</label><input id="e-d" name="date" type="date" className="input" required defaultValue={p.today} max={p.today} /></div>
                  <div className="field"><label htmlFor="e-a">Amount (GH₵)</label><input id="e-a" name="amount" className="input" inputMode="decimal" required /></div>
                </div>
              </div>
              <div className={`${C_SET_GROUP} set-group`}>
                <div className={C_SET_LABEL}>What for</div>
                <div className={`${C_FORM_ALIGNED} two`}>
                  <div className="field"><label htmlFor="e-c">Category</label><input id="e-c" name="category" className="input" required list="exp-cats" /><datalist id="exp-cats"><option>Gas / fuel</option><option>Packaging</option><option>Utilities</option><option>Rent</option><option>Wages</option><option>Marketing</option><option>Repairs</option></datalist></div>
                  <div className="field"><label htmlFor="e-n">Description (optional)</label><input id="e-n" name="description" className="input" /></div>
                </div>
              </div>
              <SubmitButton>Add expense</SubmitButton>
            </ActionForm>
          </section>
          )}
          <section className="panel">
            <h2>Expenses this period</h2>
            {expenses.length === 0 ? (
              <p className={C_DSP_EMPTY}>No expenses recorded.</p>
            ) : (
              <ul className={`${C_EVENT_LIST} [&_li]:[padding:10px_0] [&_li]:flex [&_li]:items-center [&_li]:justify-between [&_li]:[gap:12px] [&_li_>_span:nth-child(2)]:flex-1 [&_li_>_span:nth-child(2)]:[min-width:0]`}>
                {expenses.map((e) => <li key={e.id}><span className="small">{formatLocalDate(e.incurredOn, 'UTC')}</span><span>{e.category}: {formatGHS(e.amountPesewas)} {e.description && <span className="muted">({e.description})</span>}</span>{user.permissions.has('finance.manage') && <ActionButton className="btn sm ghost" action={removeExpenseAction.bind(null, e.id)} confirm={`Remove this expense (${e.category}, ${formatGHS(e.amountPesewas)})? This changes the finance totals.`}>Remove</ActionButton>}</li>)}
              </ul>
            )}
          </section>
        </aside>
      </div>
      {user.permissions.has('payments.view') && (
        <section className="panel [padding:clamp(20px,_2.4vw,_30px)] fin-payments">
          <div className={C_DSP_HEAD}>
            <h2>Payments in this period <span className={C_DSP_COUNT}>{payments.length}</span></h2>
          </div>
          <div className="grid [grid-template-columns:repeat(3,_minmax(0,_1fr))] [gap:16px] [margin:4px_0_20px] [&_>_div]:grid [&_>_div]:[gap:2px] [&_>_div]:[padding:14px_18px] [&_>_div]:[border:1px_solid_var(--line)] [&_>_div]:[border-radius:var(--r-md)] [&_>_div]:[background:var(--ivory-2)] [&_strong]:[font-size:1.4rem] max-[700px]:[grid-template-columns:1fr]">
            <div><span className="muted small">Received</span><strong className="tnum">{formatGHS(okPay.reduce((a, x) => a + x.amountPesewas, 0))}</strong><span className="small muted">{okPay.length} payment(s)</span></div>
            <div><span className="muted small">Awaiting payment</span><strong className="tnum">{pendingPay.length}</strong><span className="small muted">{formatGHS(pendingPay.reduce((a, x) => a + x.amountPesewas, 0))}</span></div>
            <div><span className="muted small">Failed</span><strong className="tnum">{failedPay.length}</strong><span className="small muted">{formatGHS(failedPay.reduce((a, x) => a + x.amountPesewas, 0))}</span></div>
          </div>
          {payments.length === 0 ? <p className={C_EMPTY_BOX}>No payments in this period.</p> : (
            <div className="table-wrap">
              <table className={`data ${C_CASES_TABLE}`}>
                <thead><tr><th>Payment</th><th>Order</th><th>Status</th><th className="num">Amount</th><th className="num">Fees</th><th>Reconciliation</th></tr></thead>
                <tbody>
                  {payments.map((a) => (
                    <tr key={a.id}>
                      <td className="small tnum">{a.reference}<div className="muted">{a.provider}{a.channel ? `, ${a.channel}` : ''}, {formatLocalDateTime(a.paidAt ?? a.createdAt, tz)}</div></td>
                      <td><Link href={`/admin/orders/${a.orderId}`} className="tnum">{a.orderNumber}</Link>{a.isTest && <> <Badge tone="neutral">test</Badge></>}</td>
                      <td><Badge tone={payTone(a.status)}>{a.status}</Badge></td>
                      <td className="num">{formatGHS(a.amountPesewas)}</td>
                      <td className="num">{a.feesPesewas != null ? formatGHS(a.feesPesewas) : ''}</td>
                      <td>
                        {a.status !== 'successful' ? '' : a.reconciliationStatus !== 'unreconciled' ? `${a.reconciliationStatus}${a.settledAmountPesewas != null ? ` (${formatGHS(a.settledAmountPesewas)})` : ''}` : user.permissions.has('payments.reconcile') ? (
                          <details>
                            <summary className="linkish">Reconcile</summary>
                            <ActionForm action={reconcileAction.bind(null, a.id)} className="stack">
                              <input name="settled" className="input" placeholder="Settled amount (GH₵)" inputMode="decimal" aria-label="Settled amount" />
                              <select name="status" className="select" aria-label="Result"><option value="matched">Matches provider</option><option value="discrepancy">Discrepancy</option></select>
                              <input name="note" className="input" placeholder="Note / settlement ref" aria-label="Note" />
                              <SubmitButton className="btn sm">Save</SubmitButton>
                            </ActionForm>
                          </details>
                        ) : 'unreconciled'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
