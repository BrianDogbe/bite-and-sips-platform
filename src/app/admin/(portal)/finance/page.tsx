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
    <tr className={strong ? 'fin-strong' : undefined} title={def}>
      <td>
        {strong ? <strong>{label}</strong> : label}
        {def && <div className="small muted fin-def">{def}</div>}
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
    <div className="fin-group">
      <div className="set-label">{title}</div>
      <div className="table-wrap">
        <table className="data fin-table">
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
      <div className="admin-top">
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
      <div className="kpis ov-kpis fin-kpis">
        <div className="kpi">
          <div className="v">{formatGHS(s.paidSales)}</div>
          <div className="l">Paid sales ({s.paidOrders} orders)</div>
        </div>
        <div className="kpi">
          <div className="v">{formatGHS(s.netPaidSales)}</div>
          <div className="l">Net paid sales</div>
        </div>
        <div className="kpi">
          <div className="v">{formatGHS(s.contributionEstimate)}</div>
          <div className="l">Estimated contribution</div>
        </div>
        <div className="kpi">
          <div className="v">{s.aov != null ? formatGHS(s.aov) : 'n/a'}</div>
          <div className="l">Average paid order</div>
        </div>
      </div>
      <section className="panel fin-flow">
        <div className="fin-flow-head">
          <h2>Where the money goes</h2>
          <span className="muted small">Share of net paid sales ({formatGHS(net)})</span>
        </div>
        {net <= 0 && costTotal <= 0 ? (
          <p className="empty-box">No paid sales in this period yet.</p>
        ) : (
          <>
            <div className="fin-bar" role="img" aria-label="Costs and remaining contribution as a share of net paid sales">
              {parts.map((x) => x.v > 0 && <span key={x.key} className={`fin-seg ${x.cls}`} style={{ width: pct(x.v) }} />)}
              {left > 0 && <span className="fin-seg left" style={{ width: pct(left) }} />}
            </div>
            <ul className="fin-legend">
              {parts.map((x) => (
                <li key={x.key}><i className={`fin-dot ${x.cls}`} /><span>{x.label}</span><strong className="tnum">{formatGHS(x.v)}</strong></li>
              ))}
              <li><i className="fin-dot left" /><span>Left over (estimate)</span><strong className="tnum">{formatGHS(left)}</strong></li>
            </ul>
          </>
        )}
      </section>
      <div className="two-col fin-layout">
        <section className="panel fin-summary">
          <input type="checkbox" id="fin-defs" className="fin-defs-toggle sr-only" />
          <div className="fin-summary-head">
            <h2>Summary</h2>
            <label htmlFor="fin-defs" className="btn sm ghost fin-defs-btn">Explain each line</label>
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
          <p className="set-status small">
            Orders placed: {s.placedOrders}. Cancelled: {s.cancelledOrders}. Average paid order: {s.aov != null ? formatGHS(s.aov) : 'n/a'}.
          </p>
          {s.unreconciledPayments > 0 && <p className="alert warn small">{s.unreconciledPayments} successful payment(s) ({formatGHS(s.unreconciledAmount)}) are not yet reconciled against provider settlements.</p>}
        </section>
        <aside className="fin-side">
          {user.permissions.has('finance.manage') && (
          <section className="panel">
            <h2>Record an expense</h2>
            <ActionForm action={expenseAction} className="zone-groups" resetOnSuccess>
              <div className="set-group">
                <div className="set-label">When and how much</div>
                <div className="form-aligned two">
                  <div className="field"><label htmlFor="e-d">Date</label><input id="e-d" name="date" type="date" className="input" required defaultValue={p.today} max={p.today} /></div>
                  <div className="field"><label htmlFor="e-a">Amount (GH₵)</label><input id="e-a" name="amount" className="input" inputMode="decimal" required /></div>
                </div>
              </div>
              <div className="set-group">
                <div className="set-label">What for</div>
                <div className="form-aligned two">
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
              <p className="dsp-empty">No expenses recorded.</p>
            ) : (
              <ul className="event-list fin-expenses">
                {expenses.map((e) => <li key={e.id}><span className="small">{formatLocalDate(e.incurredOn, 'UTC')}</span><span>{e.category}: {formatGHS(e.amountPesewas)} {e.description && <span className="muted">({e.description})</span>}</span>{user.permissions.has('finance.manage') && <ActionButton className="btn sm ghost" action={removeExpenseAction.bind(null, e.id)} confirm={`Remove this expense (${e.category}, ${formatGHS(e.amountPesewas)})? This changes the finance totals.`}>Remove</ActionButton>}</li>)}
              </ul>
            )}
          </section>
        </aside>
      </div>
      {user.permissions.has('payments.view') && (
        <section className="panel fin-payments">
          <div className="dsp-head">
            <h2>Payments in this period <span className="dsp-count">{payments.length}</span></h2>
          </div>
          <div className="fin-paystats">
            <div><span className="muted small">Received</span><strong className="tnum">{formatGHS(okPay.reduce((a, x) => a + x.amountPesewas, 0))}</strong><span className="small muted">{okPay.length} payment(s)</span></div>
            <div><span className="muted small">Awaiting payment</span><strong className="tnum">{pendingPay.length}</strong><span className="small muted">{formatGHS(pendingPay.reduce((a, x) => a + x.amountPesewas, 0))}</span></div>
            <div><span className="muted small">Failed</span><strong className="tnum">{failedPay.length}</strong><span className="small muted">{formatGHS(failedPay.reduce((a, x) => a + x.amountPesewas, 0))}</span></div>
          </div>
          {payments.length === 0 ? <p className="empty-box">No payments in this period.</p> : (
            <div className="table-wrap">
              <table className="data cases-table">
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
