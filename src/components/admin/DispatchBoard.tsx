'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useLive, postJson } from '@/lib/use-live';
import { formatGHS, parseCedisToPesewas } from '@/lib/money';
import { formatLocalTime } from '@/lib/time';
import { Badge } from '../Badge';
import { fulfillmentTone, labelFulfillment, labelKitchen, labelPayment } from '@/lib/status-ui';
import { MapEmbed, directionsUrl } from '../shop/MapEmbed';
import type { DispatchRow } from '@/server/orders/queries';
import type { RiderStatus } from '@/server/fulfillment/inhouse';
import { DIALOG, OPTGROUP, OPT_LEGEND } from '../ui';
import { C_DSP_COUNT, C_DSP_EMPTY, C_DSP_HEAD, C_LIVE_PILL } from '@/components/ui';

interface Board {
  serverTime: string;
  orders: DispatchRow[];
  riders: RiderStatus[];
  partners: { key: string; label: string; simulated: boolean; capabilities: { createDelivery: boolean; cancel: boolean } }[];
  locationStaleSeconds: number;
  defaultRiderFeePesewas: number;
}

const key = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');

function ago(iso: string | Date | null, now: number) {
  if (!iso) return 'never';
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
}

/** A visible label above a dispatch input; placeholders alone vanish once someone starts typing. */
function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

const NARROW = '(max-width: 1099px)';

export function DispatchBoard({ timezone }: { timezone: string }) {
  const { data, status, error, lastSuccess, refresh } = useLive<Board>({ url: '/api/dispatch/board', topics: ['dispatch'], pollMs: 15000 });
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  // Below 1100px the side panel would land under every list, so the details open as a bottom sheet instead.
  const [narrow, setNarrow] = useState(false);
  const [sheetBody, setSheetBody] = useState<HTMLDivElement | null>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const orders = data?.orders ?? [];
  const sel = orders.find((o) => o.id === selected) ?? null;
  const showSheet = narrow && !!sel;
  useEffect(() => {
    const d = sheet.current;
    if (!d) return;
    if (showSheet && !d.open) d.showModal();
    if (!showSheet && d.open) d.close();
  }, [showSheet]);
  const placeDetail = (node: ReactNode) => (narrow && sheetBody ? createPortal(node, sheetBody) : node);
  const groups = [
    { title: 'Needs a rider or partner', list: orders.filter((o) => o.fulfillmentStatus === 'unassigned' || o.fulfillmentStatus === 'pending') },
    { title: 'Assigned, not picked up', list: orders.filter((o) => ['assigned', 'accepted', 'at_restaurant', 'requested'].includes(o.fulfillmentStatus)) },
    { title: 'Out for delivery', list: orders.filter((o) => ['picked_up', 'on_the_way', 'arrived'].includes(o.fulfillmentStatus)) },
    { title: 'Failed or returned', list: orders.filter((o) => ['failed', 'returned'].includes(o.fulfillmentStatus)) },
    { title: 'Delivered (last 3 hours)', list: orders.filter((o) => o.fulfillmentStatus === 'delivered') },
  ];

  async function run(body: Record<string, unknown>, ok: string) {
    if (!sel) return;
    setBusy(true);
    setMsg(null);
    try {
      await postJson(`/api/dispatch/${sel.id}`, body);
      setMsg({ text: ok });
      setForm({});
    } catch (e) {
      setMsg({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
      void refresh();
    }
  }
  const f = (k: string) => form[k] ?? '';
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const stale = lastSuccess ? now - lastSuccess > 45000 : true;
  const late = (o: DispatchRow) => ['unassigned', 'assigned', 'accepted', 'at_restaurant', 'requested'].includes(o.fulfillmentStatus) && new Date(o.promisedAt).getTime() < now;

  return (
    <div className="grid [grid-template-columns:minmax(0,_1.3fr)_minmax(340px,_1fr)] [gap:28px] [align-items:start] max-[1100px]:[grid-template-columns:1fr] max-[860px]:[grid-template-columns:minmax(0,_1fr)]! [&_>_*]:[min-width:0]">
      <div className="grid [gap:20px]">
        <div className="flex items-center justify-between [gap:12px] [padding:14px_18px] [border:1px_solid_var(--line,_var(--border))] [border-radius:14px] [background:var(--surface,_#fff)]">
          <span className={`${C_LIVE_PILL} ${status === 'live' && !stale ? '' : 'stale'}`} role="status">
            <span className="dot" /> {status === 'live' && !stale ? 'Live' : `Last updated ${lastSuccess ? ago(new Date(lastSuccess), now) : 'never'}`}
          </span>
          <button className="btn sm" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
        {error && <p className="alert warn">{error}</p>}
        {groups.map((g) => (
          <section key={g.title} className="panel [padding:clamp(18px,_2vw,_26px)] [&_.table-wrap_td]:[padding:14px_16px] [&_.table-wrap_th]:[padding:14px_16px]">
            <h2 className={C_DSP_HEAD}>
              {g.title} <span className={C_DSP_COUNT}>{g.list.length}</span>
            </h2>
            {g.list.length === 0 ? (
              <p className={C_DSP_EMPTY}>None.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <tbody>
                    {g.list.map((o) => (
                      <tr
                        key={o.id}
                        aria-current={selected === o.id ? 'true' : undefined}
                        className={`cursor-pointer aria-[current=true]:[background:#eef6f2] aria-[current=true]:[&>td:first-child]:[box-shadow:inset_4px_0_0_var(--sage-dark)]${o.needsAttention ? ' attention' : ''}`}
                        onClick={() => (setSelected(o.id), setMsg(null), setForm({}))}
                      >
                        <td>
                          <button type="button" className="linkish tnum" onClick={() => setSelected(o.id)}>
                            {o.orderNumber}
                          </button>
                          <div className="small muted">
                            {o.zoneName} · ready {formatLocalTime(o.promisedAt, timezone)} {late(o) && <strong style={{ color: 'var(--danger)' }}>LATE</strong>}
                          </div>
                        </td>
                        <td>
                          <Badge tone={fulfillmentTone(o.fulfillmentStatus)}>{labelFulfillment(o.fulfillmentStatus)}</Badge>
                          <div className="small muted">Kitchen: {labelKitchen(o.kitchenStatus)}</div>
                        </td>
                        <td className="small">
                          {o.riderName ?? o.providerName ?? <span className="muted">Unassigned</span>}
                          {o.statusSource === 'manual' && o.providerName ? <div className="muted">manual status</div> : null}
                          {o.bookingStatus === 'unknown' && <div style={{ color: 'var(--danger)', fontWeight: 700 }}>Booking outcome unknown</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
        <section className="panel [padding:clamp(18px,_2vw,_26px)] [&_.table-wrap_td]:[padding:14px_16px] [&_.table-wrap_th]:[padding:14px_16px]">
          <h2 className={C_DSP_HEAD}>
            Riders <span className={C_DSP_COUNT}>{data?.riders.length ?? 0}</span>
          </h2>
          {!data?.riders.length ? (
            <p className={C_DSP_EMPTY}>
              No riders yet. Add staff with the Rider role in <Link href="/admin/staff">Staff</Link>.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Rider</th>
                    <th>Status</th>
                    <th>Active</th>
                    <th>Last location</th>
                  </tr>
                </thead>
                <tbody>
                  {data.riders.map((r) => (
                    <tr key={r.userId}>
                      <td>
                        {r.fullName}
                        <div className="small muted">{r.vehicleType}</div>
                      </td>
                      <td>
                        <Badge tone={r.online ? 'ok' : 'neutral'}>{r.online ? 'Online' : r.isOnDuty ? 'On duty, app not responding' : 'Off duty'}</Badge>
                        <div className="small muted">seen {ago(r.lastHeartbeatAt, now)}</div>
                      </td>
                      <td>{r.activeDeliveries}</td>
                      <td className="small">{r.lastLocationAt ? `${ago(r.lastLocationAt, now)}${r.locationStale ? ' (stale)' : ''}` : 'none'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <aside className="sticky [top:16px] max-[1099px]:hidden">
        {!sel ? (
          <div className="panel empty [min-height:260px] grid [place-content:center] [border:1.5px_dashed_var(--line-strong,_var(--border))] bg-transparent [padding:32px]">
            <h3>Select a delivery</h3>
            <p>Choose an order on the left to assign a rider, book a partner or update its status.</p>
          </div>
        ) : placeDetail(
          <section className="panel stack" style={{ ['--stack' as string]: '12px' }}>
            <div className="row between">
              <h2 style={{ margin: 0 }} className="tnum">
                {sel.orderNumber}
              </h2>
              <Link href={`/admin/orders/${sel.id}`} className="btn sm">
                Full order
              </Link>
            </div>
            {sel.needsAttention && <p className="alert error small">{sel.attentionReason}</p>}
            <dl className="kv">
              <dt>Customer</dt>
              <dd>
                {sel.customerName} <a href={`tel:${sel.customerPhone}`}>{sel.customerPhone}</a>
              </dd>
              <dt>Address</dt>
              <dd>
                {sel.addressLine}
                {sel.landmark ? ` (${sel.landmark})` : ''}
              </dd>
              <dt>Location</dt>
              <dd>{sel.locationVerified ? 'GPS-shared by customer' : <span style={{ color: 'var(--warn)' }}>Area chosen manually — call to confirm</span>}</dd>
              <dt>Payment</dt>
              <dd>{sel.paymentStatus === 'cash_due' ? `Cash to collect: ${formatGHS(sel.totalPesewas)}` : labelPayment(sel.paymentStatus)}</dd>
              <dt>Ready by</dt>
              <dd>{formatLocalTime(sel.promisedAt, timezone)}</dd>
            </dl>
            {sel.lat != null && sel.lng != null && <MapEmbed lat={sel.lat} lng={sel.lng} title="Delivery location" />}
            {sel.riderUserId && sel.riderLastLat != null && sel.riderLastLng != null && (
              <p className="small">
                Rider last seen at {sel.riderLastLat.toFixed(4)}, {sel.riderLastLng.toFixed(4)} ({ago(sel.riderLastLocationAt, now)}
                {sel.riderLastLocationAt && now - new Date(sel.riderLastLocationAt).getTime() > (data?.locationStaleSeconds ?? 120) * 1000 ? ', may be out of date' : ''}).{' '}
                <a href={directionsUrl(sel.riderLastLat, sel.riderLastLng)!} target="_blank" rel="noopener noreferrer">
                  Map
                </a>
              </p>
            )}
            {msg && (
              <p className={`alert ${msg.error ? 'error' : 'ok'}`} role={msg.error ? 'alert' : 'status'}>
                {msg.text}
              </p>
            )}

            {/* Assign / reassign rider */}
            {['unassigned', 'assigned', 'accepted', 'at_restaurant'].includes(sel.fulfillmentStatus) && (sel.method === 'in_house' || !sel.method) && (
              <fieldset className={OPTGROUP} style={{ margin: 0 }}>
                <legend className={OPT_LEGEND}>{sel.riderUserId ? 'Reassign rider' : 'Assign a rider'}</legend>
                <select className="select" value={f('rider')} onChange={(e) => set('rider', e.target.value)} aria-label="Rider">
                  <option value="">Choose a rider…</option>
                  {data?.riders
                    .filter((r) => r.userId !== sel.riderUserId)
                    .map((r) => (
                      <option key={r.userId} value={r.userId}>
                        {r.fullName} — {r.online ? 'online' : 'OFFLINE'}, {r.activeDeliveries} active
                      </option>
                    ))}
                </select>
                {f('rider') && !data?.riders.find((r) => r.userId === f('rider'))?.online && (
                  <label className="check small" style={{ marginTop: 8 }}>
                    <input type="checkbox" checked={f('offline') === '1'} onChange={(e) => set('offline', e.target.checked ? '1' : '')} /> Assign anyway (rider’s app hasn’t been active recently)
                  </label>
                )}
                <div className="row [align-items:end]" style={{ marginTop: 8 }}>
                  <Field id="dsp-fee" label="Rider fee (GH₵)">
                    <input id="dsp-fee" className="input" style={{ maxWidth: 160 }} placeholder={data?.defaultRiderFeePesewas ? `Default ${(data.defaultRiderFeePesewas / 100).toFixed(2)}` : undefined} value={f('fee')} onChange={(e) => set('fee', e.target.value)} inputMode="decimal" />
                  </Field>
                  <button
                    className="btn leaf"
                    disabled={busy || !f('rider')}
                    onClick={() => run({ action: 'assign', riderUserId: f('rider'), allowOffline: f('offline') === '1', riderFeePesewas: f('fee') ? parseCedisToPesewas(f('fee')) : null, reason: sel.riderUserId ? 'Reassigned by dispatch' : undefined }, 'Rider assigned. They’ll see it in their app.')}
                  >
                    {sel.riderUserId ? 'Reassign' : 'Assign'}
                  </button>
                </div>
                {sel.riderUserId && (
                  <div className="row [align-items:end]" style={{ marginTop: 8 }}>
                    <div className="grow">
                      <Field id="dsp-unreason" label="Reason for removing the rider">
                        <input id="dsp-unreason" className="input" value={f('unreason')} onChange={(e) => set('unreason', e.target.value)} />
                      </Field>
                    </div>
                    <button className="btn" disabled={busy || !f('unreason')} onClick={() => run({ action: 'unassign', reason: f('unreason') }, 'Rider removed. Order is back in the queue.')}>
                      Remove rider
                    </button>
                  </div>
                )}
              </fieldset>
            )}

            {/* Third-party partners */}
            {sel.fulfillmentStatus === 'unassigned' && (
              <fieldset className={OPTGROUP} style={{ margin: 0 }}>
                <legend className={OPT_LEGEND}>Use a delivery partner</legend>
                {data?.partners.filter((p) => p.capabilities.createDelivery).map((p) => (
                  <button key={p.key} className="btn block" style={{ marginBottom: 8 }} disabled={busy} onClick={() => run({ action: 'partner_request', provider: p.key, idempotencyKey: key() }, `Requested from ${p.label}.`)}>
                    Book {p.label}
                  </button>
                ))}
                <details>
                  <summary className="linkish">Record a booking made by phone/WhatsApp</summary>
                  <div className="stack" style={{ ['--stack' as string]: '8px', marginTop: 8 }}>
                    <Field id="dsp-pname" label="Partner name">
                      <input id="dsp-pname" className="input" placeholder="e.g. Bolt Send, local courier" value={f('pname')} onChange={(e) => set('pname', e.target.value)} />
                    </Field>
                    <Field id="dsp-pref" label="Partner reference (optional)">
                      <input id="dsp-pref" className="input" value={f('pref')} onChange={(e) => set('pref', e.target.value)} />
                    </Field>
                    <Field id="dsp-pfee" label="Fee charged by partner (GH₵)">
                      <input id="dsp-pfee" className="input" inputMode="decimal" value={f('pfee')} onChange={(e) => set('pfee', e.target.value)} />
                    </Field>
                    <Field id="dsp-pnotes" label="Notes (optional)">
                      <input id="dsp-pnotes" className="input" placeholder="e.g. expected pickup 13:20" value={f('pnotes')} onChange={(e) => set('pnotes', e.target.value)} />
                    </Field>
                    <button className="btn" disabled={busy || !f('pname')} onClick={() => run({ action: 'manual_booking', providerName: f('pname'), externalRef: f('pref') || null, feePesewas: f('pfee') ? parseCedisToPesewas(f('pfee')) : null, notes: f('pnotes') || null, idempotencyKey: key() }, 'Manual booking recorded.')}>
                      Save manual booking
                    </button>
                  </div>
                </details>
              </fieldset>
            )}

            {sel.bookingStatus === 'unknown' && sel.bookingId && (
              <fieldset className={OPTGROUP} style={{ margin: 0 }}>
                <legend className={OPT_LEGEND}>Reconcile partner booking</legend>
                <p className="small">The partner didn’t respond, so we don’t know if the delivery was booked. Check the partner’s app/dashboard before booking again.</p>
                <button className="btn block" disabled={busy} onClick={() => run({ action: 'partner_reconcile', bookingId: sel.bookingId }, 'Checked with partner.')}>
                  Ask the partner
                </button>
                <div className="row [align-items:end]" style={{ marginTop: 8 }}>
                  <div className="grow">
                    <Field id="dsp-rref" label="Partner reference, if it was booked">
                      <input id="dsp-rref" className="input" value={f('rref')} onChange={(e) => set('rref', e.target.value)} />
                    </Field>
                  </div>
                  <button className="btn" disabled={busy || !f('rref')} onClick={() => run({ action: 'partner_reconcile', bookingId: sel.bookingId, outcome: 'booked', externalRef: f('rref') }, 'Marked as booked.')}>
                    It was booked
                  </button>
                </div>
                <button className="btn ghost block" disabled={busy} onClick={() => run({ action: 'partner_reconcile', bookingId: sel.bookingId, outcome: 'not_booked' }, 'Marked as not booked. You can book again.')}>
                  It was not booked
                </button>
              </fieldset>
            )}

            {(sel.method === 'third_party' || sel.method === 'manual_partner') && !['delivered', 'cancelled', 'unassigned'].includes(sel.fulfillmentStatus) && (
              <fieldset className={OPTGROUP} style={{ margin: 0 }}>
                <legend className={OPT_LEGEND}>Partner delivery status {sel.method === 'manual_partner' ? '(entered manually)' : ''}</legend>
                <select className="select" value={f('pstatus')} onChange={(e) => set('pstatus', e.target.value)} aria-label="New status">
                  <option value="">Update status…</option>
                  <option value="courier_assigned">Courier assigned</option>
                  <option value="picked_up">Picked up</option>
                  <option value="on_the_way">On the way</option>
                  <option value="delivered">Delivered</option>
                  <option value="failed">Failed</option>
                </select>
                {f('pstatus') === 'courier_assigned' && (
                  <div style={{ marginTop: 8 }}>
                    <Field id="dsp-cname" label="Courier name">
                      <input id="dsp-cname" className="input" value={f('cname')} onChange={(e) => set('cname', e.target.value)} />
                    </Field>
                  </div>
                )}
                {f('pstatus') === 'delivered' && (
                  <div style={{ marginTop: 8 }}>
                    <Field id="dsp-ffee" label="Final fee from partner (GH₵, optional)">
                      <input id="dsp-ffee" className="input" inputMode="decimal" value={f('ffee')} onChange={(e) => set('ffee', e.target.value)} />
                    </Field>
                  </div>
                )}
                <div style={{ marginTop: 8 }}>
                  <Field id="dsp-pnote" label="Note (optional)">
                    <input id="dsp-pnote" className="input" value={f('pnote')} onChange={(e) => set('pnote', e.target.value)} />
                  </Field>
                </div>
                <button
                  className="btn"
                  style={{ marginTop: 8 }}
                  disabled={busy || !f('pstatus')}
                  onClick={() => run({ action: 'partner_status', status: f('pstatus'), courierName: f('cname') || null, feePesewas: f('ffee') ? parseCedisToPesewas(f('ffee')) : null, reason: f('pnote') || null }, 'Status updated.')}
                >
                  Save status
                </button>
                {['requested', 'assigned'].includes(sel.fulfillmentStatus) && (
                  <div className="row [align-items:end]" style={{ marginTop: 8 }}>
                    <div className="grow">
                      <Field id="dsp-creason" label="Reason for cancelling the booking">
                        <input id="dsp-creason" className="input" value={f('creason')} onChange={(e) => set('creason', e.target.value)} />
                      </Field>
                    </div>
                    <button className="btn" disabled={busy || !f('creason')} onClick={() => run({ action: 'partner_cancel', reason: f('creason') }, 'Partner booking cancelled.')}>
                      Cancel booking
                    </button>
                  </div>
                )}
              </fieldset>
            )}

            {sel.method === 'in_house' && ['picked_up', 'on_the_way', 'arrived'].includes(sel.fulfillmentStatus) && (
              <fieldset className={OPTGROUP} style={{ margin: 0 }}>
                <legend className={OPT_LEGEND}>Delivery problems</legend>
                <Field id="dsp-oreason" label="What happened? (required)">
                  <input id="dsp-oreason" className="input" value={f('oreason')} onChange={(e) => set('oreason', e.target.value)} />
                </Field>
                <div className="row" style={{ marginTop: 8 }}>
                  <button
                    className="btn"
                    disabled={busy || f('oreason').length < 5}
                    onClick={() => {
                      if (window.confirm(`Confirm order ${sel.orderNumber} as delivered without the customer’s PIN? Only do this after confirming with the customer by phone.`)) void run({ action: 'override', reason: f('oreason') }, 'Delivery confirmed without PIN.');
                    }}
                  >
                    Confirm delivered without PIN
                  </button>
                  <button className="btn danger" disabled={busy || !f('oreason')} onClick={() => run({ action: 'fail', reason: f('oreason') }, 'Marked as failed.')}>
                    Mark failed
                  </button>
                </div>
                {sel.pinLocked && <p className="alert warn small">The PIN is locked after too many wrong attempts. Confirm with the customer by phone before overriding.</p>}
              </fieldset>
            )}

            {['failed', 'returned'].includes(sel.fulfillmentStatus) && (
              <fieldset className={OPTGROUP} style={{ margin: 0 }}>
                <legend className={OPT_LEGEND}>After a failed delivery</legend>
                <Field id="dsp-fnote" label="Note (optional)">
                  <input id="dsp-fnote" className="input" value={f('fnote')} onChange={(e) => set('fnote', e.target.value)} />
                </Field>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn leaf" disabled={busy} onClick={() => run({ action: 'resolve_failed', next: 'unassigned', reason: f('fnote') || 'Reattempt' }, 'Back in the dispatch queue for another attempt.')}>
                    Try again
                  </button>
                  {sel.fulfillmentStatus === 'failed' && (
                    <button className="btn" disabled={busy} onClick={() => run({ action: 'resolve_failed', next: 'returned', reason: f('fnote') || 'Returned to restaurant' }, 'Marked as returned.')}>
                      Food returned to restaurant
                    </button>
                  )}
                </div>
                <p className="hint">To cancel and refund, open the full order.</p>
              </fieldset>
            )}
          </section>,
        )}
      </aside>

      <dialog
        ref={sheet}
        // The shared centred dialog above 640px; at 640px and below, a full-width sheet pinned to the bottom.
        className={`${DIALOG} overflow-y-auto max-[640px]:fixed max-[640px]:inset-x-0 max-[640px]:top-auto max-[640px]:bottom-0 max-[640px]:w-full! max-[640px]:max-w-none! max-[640px]:max-h-[85dvh]! max-[640px]:rounded-t-[var(--r-lg)]`}
        aria-label={sel ? `Delivery ${sel.orderNumber}` : 'Delivery'}
        onClose={() => narrow && setSelected(null)}
        onClick={(e) => e.target === e.currentTarget && sheet.current?.close()}
      >
        <div className="flex justify-end [padding:12px_12px_0]">
          <button type="button" className="btn sm" onClick={() => sheet.current?.close()}>
            Close
          </button>
        </div>
        <div ref={setSheetBody} className="[padding:8px_12px_16px] [&_.panel]:border-0 [&_.panel]:p-0 [&_.panel]:shadow-none" />
      </dialog>
    </div>
  );
}
