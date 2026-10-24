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
import { PRICE, CART_LINE, MODS, TOTALS, TOTAL_LINE, TOTAL_GRAND, TWO_COL, SIDEBAR } from '../ui';
import { C_LIVE_PILL } from '@/components/ui';
import { ACTIVE_ORDER_STORE, ACTIVE_ORDER_EVENT } from './ShopHeader';

const PK_LABEL = 'text-[0.8rem] uppercase tracking-[0.08em] opacity-75';
const PK_VALUE = 'text-[length:clamp(1.6rem,6vw,2.2rem)] tracking-[0.06em] max-[380px]:tracking-[0.03em]';
const PK_CARD = 'grid gap-1 rounded-[14px] bg-espresso p-[18px] text-center text-[#efe6d2]';
const PK_DT = 'text-[0.78rem] uppercase tracking-[0.06em] text-muted';
const PK_DD = 'm-0 mt-0.5 font-semibold text-espresso';
const PK_DD_SMALL = 'block font-normal text-muted';
/** "Need help?" buttons: long labels wrap inside the panel instead of overflowing; icon and text stay centred together. */
const HELP_BTN = 'btn block whitespace-normal py-2.5 text-center leading-[1.3]';

/** Step circle + connector line for the progress bar in the header. */
function stepCls(state: 'done' | 'current' | 'todo') {
  const color = state === 'current' ? 'font-bold text-white' : state === 'done' ? 'text-[rgba(239,230,210,0.9)]' : 'text-[rgba(239,230,210,0.6)]';
  const line = state === 'todo' ? 'before:bg-[rgba(239,230,210,0.25)]' : 'before:bg-[var(--caramel)]';
  return `relative flex flex-col items-center gap-1.5 text-center first:before:hidden before:absolute before:right-1/2 before:top-[11px] before:h-0.5 before:w-full before:content-[''] ${line} ${color}`;
}
function dotCls(state: 'done' | 'current' | 'todo') {
  const look = state === 'current' ? 'border-[#efe6d2] bg-[#efe6d2] shadow-[0_0_0_4px_rgba(239,230,210,0.22)]' : state === 'done' ? 'border-[var(--caramel)] bg-[var(--caramel)]' : 'border-[rgba(239,230,210,0.4)] bg-espresso';
  return `relative z-[1] grid size-6 place-items-center rounded-full border-2 text-[0.75rem] font-bold text-espresso ${look}`;
}

type View = TrackingView;

const FINISHED: CustomerStage[] = ['delivered', 'completed', 'cancelled'];
const LATE_STAGES: CustomerStage[] = ['received', 'confirmed', 'preparing', 'waiting_for_rider', 'rider_assigned', 'picked_up', 'on_the_way'];

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
  const finished = FINISHED.includes(stage);
  const [copied, setCopied] = useState(false);

  // Remember this order on the device while it's in progress; forget it once it's done.
  useEffect(() => {
    try {
      const cur = JSON.parse(localStorage.getItem(ACTIVE_ORDER_STORE) || 'null') as { token?: string } | null;
      if (!finished) localStorage.setItem(ACTIVE_ORDER_STORE, JSON.stringify({ token, orderNumber: o.orderNumber, savedAt: Date.now() }));
      else if (cur?.token === token) localStorage.removeItem(ACTIVE_ORDER_STORE);
      window.dispatchEvent(new Event(ACTIVE_ORDER_EVENT));
    } catch {
      /* storage unavailable: the page still works, the header just can't link back */
    }
  }, [token, o.orderNumber, finished]);

  // Built after hydration so the server and browser render the same markup.
  const [pageUrl, setPageUrl] = useState('');
  useEffect(() => setPageUrl(`${window.location.origin}/track/${token}`), [token]);
  const shareText = `My ${v.restaurant.name} order ${o.orderNumber}: ${pageUrl}`;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Copy this link to your order:', pageUrl);
    }
  }

  const tl = v.timeline as CustomerStage[];
  const idx = tl.indexOf(stage);
  const sameDay = localDateKey(new Date(o.promisedAt), tz) === localDateKey(new Date(), tz);
  const promised = sameDay ? formatLocalTime(o.promisedAt, tz) : formatLocalDateTime(o.promisedAt, tz);
  const expiresIn = o.paymentExpiresAt ? new Date(o.paymentExpiresAt).getTime() - now : null;
  // Past the promised time while still on our side (not waiting on payment or on the customer collecting).
  const lateMin = Math.floor((now - new Date(o.promisedAt).getTime()) / 60000);
  const late = LATE_STAGES.includes(stage) && lateMin >= 1;
  const lateBy = lateMin < 60 ? `about ${lateMin} min` : lateMin < 120 ? 'over an hour' : `over ${Math.floor(lateMin / 60)} hours`;

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
      <section className="bg-espresso pb-9 pt-7 text-white [@media(max-height:480px)_and_(orientation:landscape)]:py-4">
        <div className="mx-auto w-full max-w-[var(--maxw)] px-[var(--gutter)]">
          <div className="row between">
            <p style={{ margin: 0 }}>
              Order <strong className="tnum">{o.orderNumber}</strong>
            </p>
            <span className={`${C_LIVE_PILL} ${status === 'live' && !stale ? '' : 'stale'}`} role="status">
              <span className="dot" aria-hidden="true" />
              {status === 'live' && !stale ? 'Live updates' : lastSuccess ? `Updated ${ago(now - lastSuccess)}` : 'Connecting…'}
            </span>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-[length:clamp(2rem,6vw,3.4rem)] font-normal leading-[1.05] tracking-[-0.005em]" aria-live="polite" style={{ marginTop: 14 }}>
            {CUSTOMER_STAGE_LABELS[stage]}
          </h1>
          <p style={{ color: '#efe6d2', marginBottom: 0 }}>
            {stage === 'awaiting_payment' && 'Your order is reserved. Complete payment to send it to the kitchen.'}
            {stage === 'received' && 'The kitchen has your order.'}
            {stage === 'confirmed' && 'The kitchen has accepted your order.'}
            {stage === 'preparing' && (late ? 'Being prepared.' : `Being prepared. ${o.fulfillmentType === 'pickup' ? `Pickup time: ${promised}.` : `Expected ready around ${promised}.`}`)}
            {stage === 'ready_for_pickup' && 'Show your order number at the counter.'}
            {stage === 'waiting_for_rider' && 'Your food is ready and waiting for a rider.'}
            {stage === 'rider_assigned' && 'A rider is on the way to the restaurant.'}
            {(stage === 'picked_up' || stage === 'on_the_way') && 'Your food is on its way. Have your delivery PIN ready.'}
            {stage === 'delivered' && 'Enjoy your meal!'}
            {stage === 'completed' && 'Collected. Enjoy your meal!'}
            {stage === 'cancelled' && (o.cancelReason ? `Reason: ${o.cancelReason}` : 'This order was cancelled.')}
            {stage === 'attention' && 'There’s a problem with the delivery. We’ll contact you, or you can reach us below.'}
          </p>
          {late && (
            <div className="alert warn mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5" role="status">
              <p className="m-0">
                <strong>{lateMin > 180 ? `This order is much later than promised. ${v.restaurant.phone ? 'Please call us.' : 'Please contact us below.'}` : `Running ${lateBy} late. Sorry, we’re on it.`}</strong> {o.fulfillmentType === 'pickup' ? 'Your pickup' : 'Your order'} was due at {promised}.
              </p>
              {v.restaurant.phone && (
                <a className="btn sm" href={`tel:${v.restaurant.phone.replace(/\s/g, '')}`}>
                  <Icon name="phone" size={16} className="flex-none" /> Call {v.restaurant.name}
                </a>
              )}
            </div>
          )}
          {stage !== 'cancelled' && stage !== 'attention' && (
            <ol className="relative m-0 mt-[22px] grid list-none auto-cols-fr grid-flow-col p-0 max-[380px]:auto-cols-[minmax(0,1fr)]" aria-label="Order progress">
              {tl.map((st, i) => (
                <li key={st} className={stepCls(i < idx ? 'done' : i === idx ? 'current' : 'todo')} aria-current={i === idx ? 'step' : undefined}>
                  <span className={dotCls(i < idx ? 'done' : i === idx ? 'current' : 'todo')} aria-hidden="true">{i < idx || (i === idx && i === tl.length - 1) ? '✓' : ''}</span>
                  {/* Small phones: only the current step is labelled, on one line; the rest stay for screen readers. */}
                  <span className={`max-w-20 text-[0.75rem] leading-[1.2] min-[640px]:max-w-[110px] min-[640px]:text-[0.82rem] ${i === idx ? 'max-[380px]:max-w-none max-[380px]:whitespace-nowrap max-[380px]:[li:first-child>&]:self-start max-[380px]:[li:last-child>&]:self-end' : 'max-[380px]:sr-only'}`}>{CUSTOMER_STAGE_LABELS[st]}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <div className="mx-auto w-full max-w-[var(--maxw)] px-[var(--gutter)] pb-[clamp(72px,10vw,144px)] pt-6">
        {!finished && (
          <section className="panel mb-5 grid gap-3" aria-labelledby="keep-h">
            <div>
              <h2 id="keep-h" className="m-0 mb-1 text-[1.25rem]">
                Keep this page
              </h2>
              <p className="m-0 text-[0.95rem]">
                It’s the quickest way back to your order. Send the link to yourself on WhatsApp, or copy it. If you close it, tap <strong>Your order</strong> at the top of our site, or track it with order number <strong className="tnum">{o.orderNumber}</strong> and your phone number.
              </p>
            </div>
            <div className="row">
              <a className="btn leaf" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer">
                <Icon name="chat" size={18} /> Send to WhatsApp
              </a>
              <button type="button" className="btn" onClick={copyLink}>
                <Icon name={copied ? 'check' : 'receipt'} size={18} /> {copied ? 'Link copied' : 'Copy link'}
              </button>
            </div>
            <p className="hint m-0">This link shows your order{o.fulfillmentType === 'delivery' ? ' and delivery PIN' : ''}, so only share it with someone you trust.</p>
            <span className="sr-only" aria-live="polite">
              {copied ? 'Link copied' : ''}
            </span>
          </section>
        )}
        {error && <p className="alert warn">{error}</p>}
        {o.isTest && <p className="mb-3.5 mt-0 inline-block rounded-full bg-caramel-tint px-2.5 py-1 text-[0.8rem] font-semibold text-caramel">Test order · simulated payment</p>}
        {fromPayment && o.status === 'pending_payment' && o.paymentStatus !== 'failed' && (
          <p className="alert info" role="status">
            We’re waiting for the payment provider to confirm your payment. This page updates automatically. Mobile Money approvals can take a minute.
          </p>
        )}

        <div className={TWO_COL}>
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
              <section className="panel grid gap-4" aria-labelledby="deliv-h">
                <h2 id="deliv-h" className="sr-only">Delivery</h2>
                {v.pin ? (
                  <div className={PK_CARD}>
                    <span className={PK_LABEL}>Your delivery PIN</span>
                    <strong className={`tnum ${PK_VALUE}`} aria-label={`PIN ${v.pin.split('').join(' ')}`}>{v.pin}</strong>
                    <small className="opacity-75">Give it to the rider only when you receive your food. We’ll never ask for it by phone.</small>
                  </div>
                ) : (
                  <div className={PK_CARD}>
                    <span className={PK_LABEL}>Your order number</span>
                    <strong className={`tnum ${PK_VALUE}`}>{o.orderNumber}</strong>
                    <small className="opacity-75">Your delivery PIN appears here once a rider is assigned</small>
                  </div>
                )}
                <dl className="m-0 grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
                  <div>
                    <dt className={PK_DT}>{late ? 'Was due' : 'Expected'}</dt>
                    <dd className={PK_DD}>
                      {promised}
                      {o.isAsap && !late && <small className={PK_DD_SMALL}>Around this time</small>}
                    </dd>
                  </div>
                  <div>
                    <dt className={PK_DT}>Deliver to</dt>
                    <dd className={PK_DD}>
                      {v.fulfillment.addressLine || v.fulfillment.zoneName || '—'}
                      {v.fulfillment.landmark && <small className={PK_DD_SMALL}>{v.fulfillment.landmark}</small>}
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
              <section className="panel grid gap-4">
                <div className={PK_CARD}>
                  <span className={PK_LABEL}>Your order number</span>
                  <strong className={`tnum ${PK_VALUE}`}>{o.orderNumber}</strong>
                  <small className="opacity-75">Show this at the counter</small>
                </div>
                <dl className="m-0 grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
                  <div>
                    <dt className={PK_DT}>Pickup time</dt>
                    <dd className={PK_DD}>
                      {promised}
                      {o.isAsap && <small className={PK_DD_SMALL}>Earliest available</small>}
                    </dd>
                  </div>
                  <div>
                    <dt className={PK_DT}>Where</dt>
                    <dd className={PK_DD}>{v.restaurant.addressLine || v.restaurant.name}</dd>
                  </div>
                </dl>
                {v.restaurant.pickupInstructions && <p className="muted m-0 text-[0.92rem]">{v.restaurant.pickupInstructions}</p>}
              </section>
            )}

            <section className="panel" aria-labelledby="progress-h">
              <h2 id="progress-h">Activity</h2>
              {(stage === 'cancelled' || stage === 'attention') && <p className="alert warn">{CUSTOMER_STAGE_LABELS[stage]}</p>}
              {v.notifications.length === 0 && <p className="muted">Updates will appear here as your order moves along.</p>}
              {v.notifications.length > 0 && (
                <>
                                    <ol className="m-0 list-none border-l-2 border-line p-0 pl-[18px]">
                    {[...v.notifications].reverse().slice(0, showAllUpdates ? undefined : 3).map((n, i) => (
                      <li key={n.id} className={`relative pb-4 pl-3.5 last:pb-0 [overflow-wrap:anywhere] before:absolute before:-left-6 before:top-[5px] before:size-2.5 before:rounded-full before:border-2 before:content-[''] ${i === 0 ? 'before:border-sage before:bg-sage' : 'before:border-[var(--line-strong)] before:bg-ivory'}`}>
                        <div className="flex items-baseline justify-between gap-3 max-[380px]:flex-wrap max-[380px]:gap-x-3 max-[380px]:gap-y-0.5">
                          <strong className="text-espresso">{n.title.replace(/\.$/, '')}</strong>
                          <time className="tnum whitespace-nowrap text-[0.85rem] text-muted">{formatLocalTime(n.createdAt, tz)}</time>
                        </div>
                        <p className="m-0 mt-0.5 text-[0.92rem] leading-[1.4] text-muted">{n.body.replace(/Track( it)? here:? \S+|Track: \S+|tracking page: \S+/g, '').replace(/^Bite & Sips:\s*/, '').trim()}</p>
                      </li>
                    ))}
                  </ol>
                  {v.notifications.length > 3 && (
                    <button type="button" className="mt-3 cursor-pointer border-0 bg-transparent p-0 font-semibold text-sage underline" onClick={() => setShowAllUpdates((x) => !x)}>
                      {showAllUpdates ? 'Show fewer' : `Show all ${v.notifications.length} updates`}
                    </button>
                  )}
                </>
              )}
            </section>
          </div>

          <aside className={`stack ${SIDEBAR}`} style={{ ['--stack' as string]: '20px' }}>
            <section className="panel">
              <h2>Order details</h2>
              {v.items.map((it) => (
                <div key={it.id} className={CART_LINE}>
                  <div>
                    <strong>
                      {it.quantity}× {it.itemName}
                    </strong>
                    {it.variantName && <span className="muted"> ({it.variantName})</span>}
                    {it.modifiers.length > 0 && <div className={MODS}>{it.modifiers.map((m) => m.name).join(', ')}</div>}
                    {it.instructions && <div className={MODS}>Note: {it.instructions}</div>}
                  </div>
                  <span className={PRICE}>{formatGHS(it.lineTotalPesewas)}</span>
                </div>
              ))}
              <div className={TOTALS} style={{ marginTop: 12 }}>
                <div className={TOTAL_LINE}>
                  <span>Subtotal</span>
                  <span>{formatGHS(o.subtotalPesewas)}</span>
                </div>
                {o.discountPesewas > 0 && (
                  <div className={TOTAL_LINE}>
                    <span>Discount</span>
                    <span>−{formatGHS(o.discountPesewas)}</span>
                  </div>
                )}
                {o.deliveryFeePesewas > 0 && (
                  <div className={TOTAL_LINE}>
                    <span>Delivery</span>
                    <span>{formatGHS(o.deliveryFeePesewas)}</span>
                  </div>
                )}
                {o.serviceChargePesewas > 0 && (
                  <div className={TOTAL_LINE}>
                    <span>Service charge</span>
                    <span>{formatGHS(o.serviceChargePesewas)}</span>
                  </div>
                )}
                {o.taxPesewas > 0 && (
                  <div className={TOTAL_LINE}>
                    <span>Taxes</span>
                    <span>{formatGHS(o.taxPesewas)}</span>
                  </div>
                )}
                <div className={TOTAL_GRAND}>
                  <span>Total</span>
                  <span>{formatGHS(o.totalPesewas)}</span>
                </div>
                {o.refundedPesewas > 0 && (
                  <div className={TOTAL_LINE}>
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
              <h2 className="mb-5">Need help?</h2>
              <div className="stack" style={{ ['--stack' as string]: '10px' }}>
                {v.restaurant.phone && (
                  <a className={HELP_BTN} href={`tel:${v.restaurant.phone.replace(/\s/g, "")}`}>
                    <Icon name="phone" size={18} className="flex-none" /> Call {v.restaurant.name}
                  </a>
                )}
                <Link className={HELP_BTN} href={`/help?t=${encodeURIComponent(token)}`}>
                  Report a problem with this order
                </Link>
                <Link className={HELP_BTN} href="/menu">
                  Order more
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
