import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { requirePagePerm, getCurrentUser } from '@/server/auth/current';
import { financeSummary, paymentsList, listExpenses, addExpense, METRIC_DEFINITIONS } from '@/server/reporting';
import { reconcileAttempt } from '@/server/payments/service';
import { getSettings } from '@/server/settings';
import { resolvePeriod } from '@/server/period';
import { runAction, str } from '@/server/action';
import { formatGHS, parseCedisToPesewas } from '@/lib/money';
import { formatLocalDateTime, formatLocalDate } from '@/lib/time';
import { PeriodPicker } from '@/components/admin/PeriodPicker';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { invalid } from '@/server/errors';
import type { ActionResult } from '@/lib/action-result';

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
    <tr>
      <td>
        {strong ? <strong>{label}</strong> : label}
        {def && <div className="small muted">{def}</div>}
      </td>
      <td className="num" style={{ fontWeight: strong ? 700 : undefined }}>
        {neg && /^GH/.test(value) ? '−' : ''}
        {value}
      </td>
    </tr>
  );
}

export default async function Finance({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const user = await requirePagePerm('finance.view', '/admin/login');
  const tz = (await getSettings('restaurant')).timezone;
  const p = resolvePeriod(await searchParams, tz);
  const [s, payments, expenses] = await Promise.all([financeSummary(user, p.from, p.to), user.permissions.has('payments.view') ? paymentsList(user, p.from, p.to) : Promise.resolve([]), listExpenses(user, p.from, p.to)]);
  const D = METRIC_DEFINITIONS;
  return (
    <>
      <div className="admin-top">
        <h1>Finance</h1>
        <div className="row">
          <a className="btn sm" href={`/api/admin/export?type=payments&from=${p.fromKey}&to=${p.toKey}`}>Export payments CSV</a>
          <a className="btn sm" href={`/api/admin/export?type=orders&from=${p.fromKey}&to=${p.toKey}`}>Export orders CSV</a>
        </div>
      </div>
      <PeriodPicker {...p} />
      <p className="alert info small">This is an operational summary, not an accounting system. Settlement amounts from the payment provider may differ from payments received; reconcile them below. Test orders are excluded.</p>
      <div className="two-col">
        <section className="panel">
          <h2 style={{ fontSize: '1.15rem' }}>{formatLocalDate(p.from, tz)} to {formatLocalDate(new Date(p.to.getTime() - 1), tz)}</h2>
          <div className="table-wrap">
            <table className="data">
              <tbody>
                <Row label="Gross order value" value={formatGHS(s.grossOrderValue)} def={D.grossOrderValue} />
                <Row label="Discounts given" value={formatGHS(s.discounts)} def={D.discounts} />
                <Row label="Delivery fees charged" value={formatGHS(s.deliveryFeesCharged)} def={D.deliveryFeesCharged} />
                <Row label="Paid sales" value={formatGHS(s.paidSales)} def={`${D.paidSales} (${s.paidOrders} orders)`} strong />
                <Row label="Refunds processed" value={formatGHS(s.refunds)} def={D.refunds} neg />
                <Row label="Net paid sales" value={formatGHS(s.netPaidSales)} def={D.netPaidSales} strong />
                <Row label="Payment processing fees" value={s.paymentFees != null ? formatGHS(s.paymentFees) : 'Not reported'} def={`${D.paymentFees} Reported for ${s.paymentFeesComplete} of ${s.paidOrders} payments.`} neg />
                <Row label="Delivery costs" value={formatGHS(s.deliveryCosts)} def={D.deliveryCosts} neg />
                <Row label="Ingredient cost (estimate)" value={s.ingredientCostEstimate != null ? formatGHS(s.ingredientCostEstimate) : 'No recipe costing'} def={D.ingredientCostEstimate} neg />
                <Row label="Estimated contribution" value={formatGHS(s.contributionEstimate)} def={D.contributionEstimate} strong />
                <Row label="Other expenses recorded" value={formatGHS(s.expenses)} def={D.expenses} />
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>Average paid order: {s.aov != null ? formatGHS(s.aov) : 'n/a'}. Orders placed: {s.placedOrders}, cancelled: {s.cancelledOrders}.</p>
          {s.unreconciledPayments > 0 && <p className="alert warn small">{s.unreconciledPayments} successful payment(s) ({formatGHS(s.unreconciledAmount)}) are not yet reconciled against provider settlements.</p>}
        </section>
        <section className="panel">
          <h2 style={{ fontSize: '1.15rem' }}>Record an expense</h2>
          <ActionForm action={expenseAction} className="stack" resetOnSuccess>
            <div className="grid-2">
              <div className="field"><label htmlFor="e-d">Date</label><input id="e-d" name="date" type="date" className="input" required defaultValue={p.today} max={p.today} /></div>
              <div className="field"><label htmlFor="e-a">Amount (GH₵)</label><input id="e-a" name="amount" className="input" inputMode="decimal" required /></div>
            </div>
            <div className="field"><label htmlFor="e-c">Category</label><input id="e-c" name="category" className="input" required list="exp-cats" /><datalist id="exp-cats"><option>Gas / fuel</option><option>Packaging</option><option>Utilities</option><option>Rent</option><option>Wages</option><option>Marketing</option><option>Repairs</option></datalist></div>
            <div className="field"><label htmlFor="e-n">Description</label><input id="e-n" name="description" className="input" /></div>
            <SubmitButton>Add expense</SubmitButton>
          </ActionForm>
          {expenses.length > 0 && (
            <ul className="event-list" style={{ marginTop: 12 }}>
              {expenses.map((e) => <li key={e.id}><span className="small">{formatLocalDate(e.incurredOn, 'UTC')}</span><span>{e.category}: {formatGHS(e.amountPesewas)} {e.description && <span className="muted">({e.description})</span>}</span></li>)}
            </ul>
          )}
        </section>
      </div>
      {user.permissions.has('payments.view') && (
        <section className="panel" style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: '1.15rem' }}>Payments in this period</h2>
          {payments.length === 0 ? <p className="muted">No payments.</p> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Payment</th><th>Order</th><th>Status</th><th className="num">Amount</th><th className="num">Fees</th><th>Reconciliation</th></tr></thead>
                <tbody>
                  {payments.map((a) => (
                    <tr key={a.id}>
                      <td className="small tnum">{a.reference}<div className="muted">{a.provider}{a.channel ? `, ${a.channel}` : ''}, {formatLocalDateTime(a.paidAt ?? a.createdAt, tz)}</div></td>
                      <td><Link href={`/admin/orders/${a.orderId}`} className="tnum">{a.orderNumber}</Link>{a.isTest && <span className="badge neutral plain">test</span>}</td>
                      <td>{a.status}</td>
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
