'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLive, postJson } from '@/lib/use-live';
import { formatGHS } from '@/lib/money';
import { formatLocalTime, formatLocalDateTime, localDateKey } from '@/lib/time';
import { CUSTOMER_STAGE_LABELS, type CustomerStage } from '@/lib/states';
import { MapEmbed } from './MapEmbed';
import { Icon } from '../Icon';
import type { TrackingView } from '@/server/orders/queries';
import { BackLink } from './BackLink';

type View = TrackingView;

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

export function TrackOrder({ token, initial, fromPayment, retryPay }: { token: string; initial: View; fromPayment: boolean; retryPay: boolean }) {
  const { data, status, error, lastSuccess, refresh } = useLive<View>({ url: `/api/orders/${token}`, token, initial, pollMs: 15000 });
  const v = data ?? initial;
  const o = v.order;
  const tz = v.restaurant.timezone;
  const [now, setNow] = useState(Date.now());
  const [payBusy, setPayBusy] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(retryPay ? 'We couldn’t open the payment page. Please try again.' : null);
  const [showAllUpdates, setShowAllUpdates] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const stage = v.stage as CustomerStage;
  const tl = v.timeline as CustomerStage[];
  const idx = tl.indexOf(stage);
  const sameDay = localDateKey(new Date(o.promisedAt), tz) === localDateKey(new Date(), tz);
  const promised = sameDay ? formatLocalTime(o.promisedAt, tz) : formatLocalDateTime(o.promisedAt, tz);
  const expiresIn = o.paymentExpiresAt ? new Date(o.paymentExpiresAt).getTime() - now : null;

  async function payNow() {
    setPayBusy(true);
    setPayErr(null);
    try {
      const r = await postJson<{ authorizationUrl?: string; alreadyPaid?: boolean }>(`/api/orders/${token}/pay`, {});
      if (r.authorizationUrl) window.location.assign(r.authorizationUrl);
      else {
        await refresh();
        setPayBusy(false);
      }
    } catch (e) {
      setPayErr((e as Error).message);
      setPayBusy(false);
    }
  }
  async function cancel() {
    setCancelBusy(true);
    setCancelErr(null);
    try {
      await postJson(`/api/orders/${token}/cancel`, { reason: cancelReason });
      setCancelOpen(false);
      await refresh();
    } catch (e) {
      setCancelErr((e as Error).message);
    } finally {
      setCancelBusy(false);
    }
  }

  const stale = lastSuccess ? now - lastSuccess > 60_000 : false;

  return (
    <>
      <section className="track-hero">
        <div className="wrap">
      <BackLink href="/menu" label="Back to menu" light />
          <div className="row between">
            <p style={{ margin: 0 }}>
              Order <strong className="tnum">{o.orderNumber}</strong>
            </p>
            <span className={`live-pill ${status === 'live' && !stale ? '' : 'stale'}`} role="status">
              <span className="dot" aria-hidden="true" />
              {status === 'live' && !stale ? 'Live updates' : lastSuccess ? `Updated ${ago(now - lastSuccess)}` : 'Connecting…'}
            </span>
          </div>
          <h1 className="track-stage" aria-live="polite" style={{ marginTop: 14 }}>
            {CUSTOMER_STAGE_LABELS[stage]}
          </h1>
          <p style={{ color: '#efe6d2', marginBottom: 0 }}>
            {stage === 'awaiting_payment' && 'Your order is reserved. Complete payment to send it to the kitchen.'}
            {stage === 'received' && 'The kitchen has your order.'}
            {stage === 'confirmed' && 'The kitchen has accepted your order.'}
            {stage === 'preparing' && `Being prepared. ${o.fulfillmentType === 'pickup' ? `Pickup time: ${promised}.` : `Expected ready around ${promised}.`}`}
            {stage === 'ready_for_pickup' && 'Show your order number at the counter.'}
            {stage === 'waiting_for_rider' && 'Your food is ready and waiting for a rider.'}
            {stage === 'rider_assigned' && 'A rider is on the way to the restaurant.'}
            {(stage === 'picked_up' || stage === 'on_the_way') && 'Your food is on its way. Have your delivery PIN ready.'}
            {stage === 'delivered' && 'Enjoy your meal!'}
            {stage === 'completed' && 'Collected. Enjoy your meal!'}
            {stage === 'cancelled' && (o.cancelReason ? `Reason: ${o.cancelReason}` : 'This order was cancelled.')}
            {stage === 'attention' && 'There’s a problem with the delivery. We’ll contact you, or you can reach us below.'}
          </p>
          {stage !== 'cancelled' && stage !== 'attention' && (
            <ol className="stepper" aria-label="Order progress">
              {tl.map((st, i) => (
                <li key={st} className={i < idx ? 'done' : i === idx ? 'current' : ''} aria-current={i === idx ? 'step' : undefined}>
                  <span className="st-dot" aria-hidden="true">{i < idx || (i === idx && i === tl.length - 1) ? '✓' : ''}</span>
                  <span className="st-label">{CUSTOMER_STAGE_LABELS[st]}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <div className="wrap section" style={{ paddingTop: 24 }}>
        {error && <p className="alert warn">{error}</p>}
        {o.isTest && <p className="track-test">Test order · simulated payment</p>}
        {fromPayment && o.status === 'pending_payment' && o.paymentStatus !== 'failed' && (
          <p className="alert info" role="status">
            We’re waiting for the payment provider to confirm your payment. This page updates automatically. Mobile Money approvals can take a minute.
          </p>
        )}

        <div className="checkout-grid">
          <div className="stack" style={{ ['--stack' as string]: '20px' }}>
            {o.status === 'pending_payment' && o.paymentMethod === 'online' && (
              <section className="panel">
                <h2>Payment</h2>
                {o.paymentStatus === 'failed' && <p className="alert error">Your last payment attempt didn’t go through. You can try again.</p>}
                {expiresIn != null && expiresIn > 0 ? (
                  <p>
                    Pay within <strong>{Math.ceil(expiresIn / 60000)} min</strong> to keep your {o.fulfillmentType === 'pickup' ? 'pickup time' : 'slot'}.
                  </p>
                ) : (
                  <p className="alert warn">The payment window has passed. If you already paid, we’ll confirm it automatically; otherwise the order will be cancelled.</p>
                )}
                {payErr && <p className="alert error">{payErr}</p>}
                {(expiresIn == null || expiresIn > 0) && (
                  <button className="btn primary lg" onClick={payNow} disabled={payBusy}>
                    {payBusy ? (
                      <>
                        <span className="spinner" /> Opening payment…
                      </>
                    ) : (
                      `Pay ${formatGHS(o.totalPesewas)}`
                    )}
                  </button>
                )}
              </section>
            )}

            {o.fulfillmentType === 'delivery' && o.status !== 'cancelled' && (
              <section className="panel pickup-card" aria-labelledby="deliv-h">
                <h2 id="deliv-h" className="visually-hidden">Delivery</h2>
                {v.pin ? (
                  <div className="pk-code">
                    <span>Your delivery PIN</span>
                    <strong className="tnum" aria-label={`PIN ${v.pin.split('').join(' ')}`}>{v.pin}</strong>
                    <small>Give it to the rider only when you receive your food. We’ll never ask for it by phone.</small>
                  </div>
                ) : (
                  <div className="pk-code">
                    <span>Your order number</span>
                    <strong className="tnum">{o.orderNumber}</strong>
                    <small>Your delivery PIN appears here once a rider is assigned</small>
                  </div>
                )}
                <dl className="pk-meta">
                  <div>
                    <dt>Expected</dt>
                    <dd>
                      {promised}
                      {o.isAsap && <small>Around this time</small>}
                    </dd>
                  </div>
                  <div>
                    <dt>Deliver to</dt>
                    <dd>
                      {v.fulfillment.addressLine || v.fulfillment.zoneName || '—'}
                      {v.fulfillment.landmark && <small>{v.fulfillment.landmark}</small>}
                    </dd>
                  </div>
                </dl>
              </section>
            )}

            {o.fulfillmentType === 'delivery' && (v.rider || v.partner || v.location) && (
              <section className="panel" aria-labelledby="rider-h">
                <h2 id="rider-h">Delivery</h2>
                {v.rider && (
                  <p>
                    Your rider is <strong>{v.rider.name}</strong>.
                    {v.rider.phone && (
                      <>
                        {' '}
                        <a className="btn sm" href={`tel:${v.rider.phone}`}>
                          <Icon name="phone" size={16} /> Call rider
                        </a>
                      </>
                    )}
                  </p>
                )}
                {v.partner && (
                  <div className="stack">
                    <p>
                      Delivered by <strong>{v.partner.name}</strong>
                      {v.partner.courierName ? `, courier ${v.partner.courierName}` : ''}.
                    </p>
                    {v.partner.manual && <p className="hint">Status for this delivery is updated by our staff, so it may lag slightly behind.</p>}
                    {v.partner.trackingUrl && /^https:\/\//.test(v.partner.trackingUrl) && (
                      <a className="btn sm" href={v.partner.trackingUrl} target="_blank" rel="noopener noreferrer">
                        Open partner tracking
                      </a>
                    )}
                  </div>
                )}
                {v.location &&
                  (v.location.available ? (
                    <div className="stack" style={{ ['--stack' as string]: '8px' }}>
                      <MapEmbed lat={v.location.lat} lng={v.location.lng} title="Rider’s last reported location" />
                      <p className={v.location.stale ? 'alert warn small' : 'hint'}>
                        {v.location.stale
                          ? `Last known position from ${ago(now - new Date(v.location.recordedAt).getTime())}. The rider’s phone may have lost signal; this may not be where they are now.`
                          : `Rider location updated ${ago(now - new Date(v.location.recordedAt).getTime())}.`}
                      </p>
                    </div>
                  ) : (
                    <p className="hint">The rider’s location isn’t available yet.</p>
                  ))}
              </section>
            )}

            {o.fulfillmentType === 'pickup' && o.status !== 'cancelled' && (
              <section className="panel pickup-card">
                <div className="pk-code">
                  <span>Your order number</span>
                  <strong className="tnum">{o.orderNumber}</strong>
                  <small>Show this at the counter</small>
                </div>
                <dl className="pk-meta">
                  <div>
                    <dt>Pickup time</dt>
                    <dd>
                      {promised}
                      {o.isAsap && <small>Earliest available</small>}
                    </dd>
                  </div>
                  <div>
                    <dt>Where</dt>
                    <dd>{v.restaurant.addressLine || v.restaurant.name}</dd>
                  </div>
                </dl>
                {v.restaurant.pickupInstructions && <p className="muted pk-note">{v.restaurant.pickupInstructions}</p>}
              </section>
            )}

            <section className="panel" aria-labelledby="progress-h">
              <h2 id="progress-h">Activity</h2>
              {(stage === 'cancelled' || stage === 'attention') && <p className="alert warn">{CUSTOMER_STAGE_LABELS[stage]}</p>}
              {v.notifications.length === 0 && <p className="muted">Updates will appear here as your order moves along.</p>}
              {v.notifications.length > 0 && (
                <>
                                    <ol className="upd-list">
                    {[...v.notifications].reverse().slice(0, showAllUpdates ? undefined : 3).map((n, i) => (
                      <li key={n.id} className={i === 0 ? 'latest' : ''}>
                        <div className="upd-top">
                          <strong>{n.title.replace(/\.$/, '')}</strong>
                          <time className="tnum">{formatLocalTime(n.createdAt, tz)}</time>
                        </div>
                        <p>{n.body.replace(/Track( it)? here:? \S+|Track: \S+|tracking page: \S+/g, '').replace(/^Bite & Sips:\s*/, '').trim()}</p>
                      </li>
                    ))}
                  </ol>
                  {v.notifications.length > 3 && (
                    <button type="button" className="upd-more" onClick={() => setShowAllUpdates((x) => !x)}>
                      {showAllUpdates ? 'Show fewer' : `Show all ${v.notifications.length} updates`}
                    </button>
                  )}
                </>
              )}
            </section>
          </div>

          <aside className="stack" style={{ ['--stack' as string]: '20px' }}>
            <section className="panel">
              <h2>Order details</h2>
              {v.items.map((it) => (
                <div key={it.id} className="cart-line">
                  <div>
                    <strong>
                      {it.quantity}× {it.itemName}
                    </strong>
                    {it.variantName && <span className="muted"> ({it.variantName})</span>}
                    {it.modifiers.length > 0 && <div className="mods">{it.modifiers.map((m) => m.name).join(', ')}</div>}
                    {it.instructions && <div className="mods">Note: {it.instructions}</div>}
                  </div>
                  <span className="price">{formatGHS(it.lineTotalPesewas)}</span>
                </div>
              ))}
              <div className="totals" style={{ marginTop: 12 }}>
                <div className="line">
                  <span>Subtotal</span>
                  <span>{formatGHS(o.subtotalPesewas)}</span>
                </div>
                {o.discountPesewas > 0 && (
                  <div className="line">
                    <span>Discount</span>
                    <span>−{formatGHS(o.discountPesewas)}</span>
                  </div>
                )}
                {o.deliveryFeePesewas > 0 && (
                  <div className="line">
                    <span>Delivery</span>
                    <span>{formatGHS(o.deliveryFeePesewas)}</span>
                  </div>
                )}
                {o.serviceChargePesewas > 0 && (
                  <div className="line">
                    <span>Service charge</span>
                    <span>{formatGHS(o.serviceChargePesewas)}</span>
                  </div>
                )}
                {o.taxPesewas > 0 && (
                  <div className="line">
                    <span>Taxes</span>
                    <span>{formatGHS(o.taxPesewas)}</span>
                  </div>
                )}
                <div className="line grand">
                  <span>Total</span>
                  <span>{formatGHS(o.totalPesewas)}</span>
                </div>
                {o.refundedPesewas > 0 && (
                  <div className="line">
                    <span>Refunded</span>
                    <span>{formatGHS(o.refundedPesewas)}</span>
                  </div>
                )}
              </div>
              <p className="hint" style={{ marginTop: 8 }}>
                {o.paymentMethod === 'cash' ? `Pay in cash on ${o.fulfillmentType === 'pickup' ? 'pickup' : 'delivery'}.` : ''}
                {o.paymentStatus === 'refund_pending' && ' A refund is being processed.'}
              </p>
            </section>
            <section className="panel">
              <h2>Need help?</h2>
              <div className="stack" style={{ ['--stack' as string]: '10px' }}>
                {v.restaurant.phone && (
                  <a className="btn block" href={`tel:${v.restaurant.phone.replace(/\s/g, "")}`}>
                    <Icon name="phone" size={18} /> Call {v.restaurant.name}
                  </a>
                )}
                <Link className="btn block" href={`/help?t=${encodeURIComponent(token)}`}>
                  Report a problem with this order
                </Link>
                {v.canCancel && !cancelOpen && (
                  <button className="btn ghost block" style={{ color: 'var(--danger)' }} onClick={() => setCancelOpen(true)}>
                    Cancel order
                  </button>
                )}
                {cancelOpen && (
                  <div className="stack" style={{ ['--stack' as string]: '8px' }}>
                    <label className="label" htmlFor="creason">
                      Why are you cancelling? (optional)
                    </label>
                    <input id="creason" className="input" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={300} />
                    {o.paymentStatus === 'paid' && <p className="hint">Your payment will be refunded to the original method.</p>}
                    {cancelErr && <p className="alert error">{cancelErr}</p>}
                    <div className="row">
                      <button className="btn danger" onClick={cancel} disabled={cancelBusy}>
                        {cancelBusy ? 'Cancelling…' : 'Yes, cancel order'}
                      </button>
                      <button className="btn" onClick={() => setCancelOpen(false)}>
                        Keep my order
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
