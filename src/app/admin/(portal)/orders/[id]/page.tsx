import Link from 'next/link';
import { notFound } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { requirePagePerm } from '@/server/auth/current';
import { orderDetail } from '@/server/orders/queries';
import { getSettings } from '@/server/settings';
import { isDomainError } from '@/server/errors';
import { formatGHS, pesewasToCedisString } from '@/lib/money';
import { formatLocalDateTime, formatLocalTime } from '@/lib/time';
import { Badge } from '@/components/Badge';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { ActionButton } from '@/components/ActionButton';
import { LiveRefresh } from '@/components/admin/LiveRefresh';
import { labelOrder, labelPayment, labelKitchen, labelFulfillment, orderTone, paymentTone, kitchenTone, fulfillmentTone } from '@/lib/status-ui';
import { directionsUrl } from '@/components/shop/MapEmbed';
import * as A from './actions';
import { PRICE, CART_LINE, MODS, TOTALS, TOTAL_LINE, TOTAL_GRAND } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Order' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePerm(['orders.view', 'dispatch.manage'], '/admin/login');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let d;
  try {
    d = await orderDetail(user, id);
  } catch (e) {
    if (isDomainError(e) && e.status === 404) notFound();
    throw e;
  }
  const tz = (await getSettings('restaurant')).timezone;
  const o = d.order;
  const f = d.fulfillment;
  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  const active = o.status !== 'cancelled' && o.status !== 'completed';
  const paid = ['paid', 'cash_collected', 'partially_refunded', 'refund_pending'].includes(o.paymentStatus);
  const payments = d.payments as unknown as { id: string; provider: string; reference: string; amountPesewas: number; status: string; channel: string | null; feesPesewas: number | null; paidAt: Date | null; gatewayResponse: string | null; reconciliationStatus: string; createdAt: Date }[];
  const refunds = d.refunds as unknown as { id: string; amountPesewas: number; reason: string; status: string; failureReason: string | null; createdAt: Date; processedAt: Date | null }[];
  const bookings = d.bookings as unknown as { id: string; provider: string; externalId: string | null; status: string; quotedFeePesewas: number | null; finalFeePesewas: number | null; isManual: boolean; lastError: string | null; createdAt: Date }[];

  return (
    <>
      <div className="admin-top">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link href="/admin/orders">Orders</Link>
          </p>
          <h1 className="tnum">
            {o.orderNumber} {o.isTest && <span className="badge neutral plain">test order</span>}
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Placed {formatLocalDateTime(o.createdAt, tz)}. {o.fulfillmentType === 'pickup' ? 'Pickup' : 'Delivery'} due {formatLocalDateTime(o.promisedAt, tz)}
            {o.isAsap ? ' (ASAP)' : ' (scheduled)'}.
          </p>
        </div>
        <div className="row">
          <Badge tone={orderTone(o.status)}>{labelOrder(o.status)}</Badge>
          <Badge tone={paymentTone(o.paymentStatus)}>{labelPayment(o.paymentStatus)}</Badge>
          <Badge tone={kitchenTone(o.kitchenStatus)}>Kitchen: {labelKitchen(o.kitchenStatus)}</Badge>
          <Badge tone={fulfillmentTone(f.status)}>{labelFulfillment(f.status)}</Badge>
          <LiveRefresh topics={['admin']} />
        </div>
      </div>

      {o.needsAttention && (
        <section className="alert error" style={{ marginBottom: 16 }}>
          <strong>Needs attention:</strong> {o.attentionReason}
          {can('orders.manage') && (
            <ActionForm action={A.clearAttentionAction.bind(null, id)} className="row" resetOnSuccess>
              <input name="note" className="input grow" placeholder="What did you do about it?" required maxLength={300} style={{ maxWidth: 420 }} />
              <SubmitButton className="btn sm">Mark resolved</SubmitButton>
            </ActionForm>
          )}
        </section>
      )}

      <div className="two-col">
        <div className="stack" style={{ ['--stack' as string]: '18px' }}>
          <section className="panel">
            <h2>Items</h2>
            {d.items.map((it) => (
              <div key={it.id} className={CART_LINE}>
                <div>
                  <strong>
                    {it.quantity}× {it.itemName}
                  </strong>
                  {it.variantName && <span className="muted"> ({it.variantName})</span>}
                  {it.modifiers.length > 0 && <div className={MODS}>{it.modifiers.map((m) => `${m.name}${m.pricePesewas ? ` (+${formatGHS(m.pricePesewas)})` : ''}`).join(', ')}</div>}
                  {it.instructions && <div className={MODS}>Note: {it.instructions}</div>}
                  {it.allergens.length > 0 && <div className={MODS}>Allergens: {it.allergens.join(', ')}</div>}
                </div>
                <div className={PRICE}>
                  {formatGHS(it.lineTotalPesewas)}
                  <div className="small muted">{formatGHS(it.unitPricePesewas)} each</div>
                </div>
              </div>
            ))}
            {o.customerNotes && <p className="alert info small" style={{ marginTop: 10 }}>Customer note: {o.customerNotes}</p>}
            <div className={TOTALS} style={{ marginTop: 12, maxWidth: 360, marginLeft: 'auto' }}>
              <div className={TOTAL_LINE}><span>Subtotal</span><span>{formatGHS(o.subtotalPesewas)}</span></div>
              {o.discountPesewas > 0 && <div className={TOTAL_LINE}><span>Discount</span><span>−{formatGHS(o.discountPesewas)}</span></div>}
              {o.deliveryFeePesewas > 0 && <div className={TOTAL_LINE}><span>Delivery fee</span><span>{formatGHS(o.deliveryFeePesewas)}</span></div>}
              {o.serviceChargePesewas > 0 && <div className={TOTAL_LINE}><span>Service charge</span><span>{formatGHS(o.serviceChargePesewas)}</span></div>}
              {o.taxPesewas > 0 && <div className={TOTAL_LINE}><span>Taxes</span><span>{formatGHS(o.taxPesewas)}</span></div>}
              <div className={TOTAL_GRAND}><span>Total</span><span>{formatGHS(o.totalPesewas)}</span></div>
              {o.refundedPesewas > 0 && <div className={TOTAL_LINE}><span>Refunded</span><span>{formatGHS(o.refundedPesewas)}</span></div>}
            </div>
          </section>

          <section className="panel">
            <h2>History</h2>
            <ul className="event-list">
              {d.events.map((e) => (
                <li key={e.id}>
                  <span className="muted small tnum">{formatLocalTime(e.createdAt, tz)}</span>
                  <span>
                    <strong>{e.type.replace(/[._]/g, ' ')}</strong>
                    {e.message ? `: ${e.message}` : ''}
                    <span className="muted small"> by {e.actorName ?? e.actorLabel ?? 'system'}</span>
                  </span>
                </li>
              ))}
            </ul>
            {(can('orders.manage') || can('dispatch.manage')) && (
              <ActionForm action={A.noteAction.bind(null, id)} className="row" resetOnSuccess>
                <label htmlFor="note" className="sr-only">Internal note</label>
                <input id="note" name="note" className="input grow" placeholder="Add an internal note (not shown to the customer)" maxLength={1000} required />
                <SubmitButton className="btn">Add note</SubmitButton>
              </ActionForm>
            )}
          </section>

          {can('payments.view') && (
            <section className="panel">
              <h2>Payments</h2>
              {payments.length === 0 ? (
                <p className="muted">No payment attempts yet.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr><th>Reference</th><th>Provider</th><th>Status</th><th className="num">Amount</th><th className="num">Fees</th><th /></tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td className="small tnum">{p.reference}<div className="muted">{formatLocalDateTime(p.createdAt, tz)}</div></td>
                          <td>{p.provider}{p.channel ? ` (${p.channel})` : ''}</td>
                          <td>{p.status}{p.gatewayResponse ? <div className="small muted">{p.gatewayResponse}</div> : null}<div className="small muted">{p.reconciliationStatus}</div></td>
                          <td className="num">{formatGHS(p.amountPesewas)}</td>
                          <td className="num">{p.feesPesewas != null ? formatGHS(p.feesPesewas) : 'n/a'}</td>
                          <td>{p.provider !== 'cash' && ['initialized', 'pending'].includes(p.status) && <ActionButton className="btn sm" action={A.reverifyPaymentAction.bind(null, id, p.reference)}>Check status</ActionButton>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {refunds.length > 0 && (
                <>
                  <h3 style={{ marginTop: 16 }}>Refunds</h3>
                  <ul className="event-list">
                    {refunds.map((r) => (
                      <li key={r.id}>
                        <span className="tnum">{formatGHS(r.amountPesewas)}</span>
                        <span>
                          <strong>{r.status}</strong>: {r.reason} {r.failureReason && <span style={{ color: 'var(--danger)' }}>({r.failureReason})</span>}
                          {['requested', 'pending'].includes(r.status) && can('payments.refund') && (
                            <> <ActionButton className="btn sm" action={A.syncRefundAction.bind(null, id, r.id)}>Check refund status</ActionButton></>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </div>

        <div className="stack" style={{ ['--stack' as string]: '18px' }}>
          <section className="panel">
            <h2>Customer</h2>
            <dl className="kv">
              <dt>Name</dt><dd>{o.customerName}</dd>
              <dt>Phone</dt><dd>{o.customerPhone.includes('•') ? o.customerPhone : <a href={`tel:${o.customerPhone}`}>{o.customerPhone}</a>}</dd>
              {o.customerEmail && (<><dt>Email</dt><dd>{o.customerEmail}</dd></>)}
              <dt>Account</dt><dd>{o.customerUserId ? 'Registered customer' : 'Guest'}</dd>
            </dl>
            {can('customers.view') && <p style={{ marginTop: 10 }}><Link href={`/admin/customers/${encodeURIComponent(o.customerPhone)}`}>Order history for this customer</Link></p>}
          </section>

          <section className="panel">
            <h2>{o.fulfillmentType === 'pickup' ? 'Pickup' : 'Delivery'}</h2>
            {o.fulfillmentType === 'delivery' ? (
              <dl className="kv">
                <dt>Address</dt><dd>{f.addressLine}</dd>
                {f.landmark && (<><dt>Landmark</dt><dd>{f.landmark}</dd></>)}
                {f.instructions && (<><dt>Instructions</dt><dd>{f.instructions}</dd></>)}
                <dt>Zone</dt><dd>{f.zoneName} {f.locationVerified ? '(GPS)' : <span className="badge warn plain">location not verified</span>}</dd>
                <dt>Method</dt><dd>{f.method ? f.method.replace('_', ' ') : 'Not assigned'}</dd>
                {f.providerName && (<><dt>Partner</dt><dd>{f.providerName} {f.externalRef ? `(${f.externalRef})` : ''} {f.statusSource === 'manual' ? <span className="badge neutral plain">manual status</span> : null}</dd></>)}
                {f.failureReason && (<><dt>Failure</dt><dd>{f.failureReason}</dd></>)}
                {f.podMethod && (<><dt>Proof</dt><dd>{f.podMethod}{f.podNote ? `: ${f.podNote}` : ''}</dd></>)}
              </dl>
            ) : (
              <dl className="kv">
                <dt>Due</dt><dd>{formatLocalDateTime(o.promisedAt, tz)}</dd>
                {f.collectedAt && (<><dt>Collected</dt><dd>{formatLocalDateTime(f.collectedAt, tz)}</dd></>)}
              </dl>
            )}
            {o.fulfillmentType === 'delivery' && directionsUrl(f.lat, f.lng, f.addressLine) && !String(f.addressLine).includes('hidden') && (
              <p style={{ marginTop: 10 }}><a href={directionsUrl(f.lat, f.lng, f.addressLine)!} target="_blank" rel="noopener noreferrer">Open in maps</a></p>
            )}
            {o.fulfillmentType === 'delivery' && can('dispatch.manage') && active && <p><Link className="btn sm leaf" href="/admin/dispatch">Manage in dispatch</Link></p>}
            {d.assignments.length > 0 && (
              <>
                <h3 style={{ marginTop: 14 }}>Rider assignments</h3>
                <ul className="event-list">
                  {d.assignments.map((a) => (
                    <li key={a.id}>
                      <span className="small muted">{formatLocalTime(a.assignedAt, tz)}</span>
                      <span>{a.riderName}: <strong>{a.status}</strong>{a.endReason ? ` (${a.endReason})` : ''}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {bookings.length > 0 && (
              <>
                <h3 style={{ marginTop: 14 }}>Partner bookings</h3>
                <ul className="event-list">
                  {bookings.map((b) => (
                    <li key={b.id}>
                      <span className="small muted">{formatLocalTime(b.createdAt, tz)}</span>
                      <span>{b.provider} {b.externalId ? `(${b.externalId})` : ''}: <strong>{b.status}</strong> {b.isManual ? '(manual)' : ''} {b.quotedFeePesewas != null ? `quoted ${formatGHS(b.quotedFeePesewas)}` : ''} {b.lastError ? <span style={{ color: 'var(--danger)' }}>{b.lastError}</span> : null}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {active && (
            <section className="panel stack">
              <h2>Actions</h2>
              {can('kitchen.operate') && o.status !== 'pending_payment' && (
                <div className="row">
                  {o.kitchenStatus === 'new' && <ActionButton action={A.kitchenAdminAction.bind(null, id, 'accept')}>Accept</ActionButton>}
                  {['new', 'accepted'].includes(o.kitchenStatus) && <ActionButton action={A.kitchenAdminAction.bind(null, id, 'start')}>Start preparing</ActionButton>}
                  {o.kitchenStatus === 'preparing' && <ActionButton className="btn leaf" action={A.kitchenAdminAction.bind(null, id, 'ready')}>Mark ready</ActionButton>}
                </div>
              )}
              {o.paymentStatus === 'cash_due' && can('cash.collect') && (
                <ActionForm action={A.cashAction.bind(null, id)} confirm={`Confirm you received ${formatGHS(o.totalPesewas)} in cash?`}>
                  <input type="hidden" name="amount" value={o.totalPesewas} />
                  <SubmitButton className="btn leaf">Record cash received ({formatGHS(o.totalPesewas)})</SubmitButton>
                </ActionForm>
              )}
              {o.fulfillmentType === 'pickup' && o.kitchenStatus === 'ready' && (can('orders.manage') || can('kitchen.operate')) && (
                <ActionButton className="btn primary" action={A.collectedAction.bind(null, id)}>Customer collected the order</ActionButton>
              )}
              {can('orders.cancel') && (
                <details>
                  <summary className="linkish" style={{ color: 'var(--danger)' }}>Cancel this order</summary>
                  <ActionForm action={A.cancelAction.bind(null, id)} className="stack" confirm="Cancel this order? The customer will be notified.">
                    <label className="label" htmlFor="creason">Reason (shown to the customer)</label>
                    <input id="creason" name="reason" className="input" required maxLength={300} placeholder="e.g. We’ve run out of an ingredient" />
                    <SubmitButton className="btn danger">Cancel order</SubmitButton>
                  </ActionForm>
                </details>
              )}
            </section>
          )}

          {paid && can('payments.refund') && (
            <section className="panel">
              <h2>Refund</h2>
              <ActionForm action={A.refundAction.bind(null, id)} className="stack" confirm="Send this refund to the payment provider?">
                <input type="hidden" name="key" value={randomUUID()} />
                <div className="field">
                  <label htmlFor="ramount">Amount (GH₵)</label>
                  <input id="ramount" name="amount" className="input" inputMode="decimal" required defaultValue={pesewasToCedisString(o.totalPesewas - o.refundedPesewas)} />
                </div>
                <div className="field">
                  <label htmlFor="rreason">Reason</label>
                  <input id="rreason" name="reason" className="input" required maxLength={300} />
                </div>
                <SubmitButton className="btn">Request refund</SubmitButton>
              </ActionForm>
              <p className="hint" style={{ marginTop: 8 }}>Cash orders: the refund is recorded as handed back in cash.</p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
