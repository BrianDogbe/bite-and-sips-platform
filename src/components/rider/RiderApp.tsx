'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLive, postJson } from '@/lib/use-live';
import { formatGHS } from '@/lib/money';
import { formatLocalTime } from '@/lib/time';
import { FULFILLMENT_STATUS_LABELS } from '@/lib/states';
import { directionsUrl } from '../shop/MapEmbed';
import { Icon } from '../Icon';
import { LogoutButton } from '../LoginForm';

interface Assignment {
  orderId: string;
  orderNumber: string;
  assignmentStatus: 'offered' | 'accepted';
  riderFeePesewas: number | null;
  fulfillmentStatus: string;
  kitchenStatus: string;
  paymentStatus: string;
  totalPesewas: number;
  customerName: string;
  customerPhone: string | null;
  addressLine: string | null;
  landmark: string | null;
  instructions: string | null;
  lat: number | null;
  lng: number | null;
  locationVerified: boolean;
  zoneName: string | null;
  promisedAt: string;
  pinLocked: boolean;
  itemCount: number;
  cashToCollectPesewas: number;
}
interface RiderState {
  restaurant: { name: string; addressLine: string; lat: number | null; lng: number | null; phone: string };
  assignments: Assignment[];
  history: { orderNumber: string; status: string; endReason: string | null; assignedAt: string; endedAt: string | null; riderFeePesewas: number | null; zoneName: string | null }[];
  onDuty: boolean;
  lastLocationAt: string | null;
  locationIntervalSeconds: number;
}

type LocState = { kind: 'idle' } | { kind: 'asking' } | { kind: 'denied' } | { kind: 'unavailable'; msg: string } | { kind: 'sharing'; lastSent: number | null; lastError: string | null };

export function RiderApp({ name, timezone }: { name: string; timezone: string }) {
  const { data, status, error, lastSuccess, refresh } = useLive<RiderState>({ url: '/api/rider/state', topics: ['rider'], pollMs: 15000 });
  const [onDuty, setOnDuty] = useState<boolean | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pin, setPin] = useState<Record<string, string>>({});
  const [failFor, setFailFor] = useState<string | null>(null);
  const [failReason, setFailReason] = useState('');
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [loc, setLoc] = useState<LocState>({ kind: 'idle' });
  const [tab, setTab] = useState<'jobs' | 'history'>('jobs');
  const watchId = useRef<number | null>(null);
  const lastPos = useRef<GeolocationPosition | null>(null);
  const lastSentAt = useRef(0);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (data && onDuty === null) setOnDuty(data.onDuty);
  }, [data, onDuty]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.error ? 6000 : 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // Heartbeat: proves the app is actually open, so dispatch never sees a stale "online".
  useEffect(() => {
    if (onDuty === null) return;
    const beat = () => postJson('/api/rider/heartbeat', { onDuty }).catch(() => {});
    void beat();
    const t = setInterval(beat, 30000);
    return () => clearInterval(t);
  }, [onDuty]);

  const activeAccepted = (data?.assignments ?? []).some((a) => a.assignmentStatus === 'accepted' && ['accepted', 'at_restaurant', 'picked_up', 'on_the_way', 'arrived'].includes(a.fulfillmentStatus));
  const shouldShare = !!onDuty && activeAccepted;
  const interval = (data?.locationIntervalSeconds ?? 20) * 1000;

  const send = useCallback(async (p: GeolocationPosition) => {
    try {
      await postJson('/api/rider/location', { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null, recordedAt: new Date(p.timestamp).toISOString() });
      lastSentAt.current = Date.now();
      setLoc({ kind: 'sharing', lastSent: Date.now(), lastError: null });
    } catch (e) {
      setLoc((l) => ({ kind: 'sharing', lastSent: l.kind === 'sharing' ? l.lastSent : null, lastError: (e as Error).message }));
    }
  }, []);

  // Location sharing only while on duty with an accepted, active delivery.
  useEffect(() => {
    if (!shouldShare) {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
      setLoc({ kind: 'idle' });
      return;
    }
    if (!('geolocation' in navigator)) {
      setLoc({ kind: 'unavailable', msg: 'This phone/browser cannot share location.' });
      return;
    }
    setLoc({ kind: 'asking' });
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        lastPos.current = p;
        setLoc((l) => (l.kind === 'sharing' ? l : { kind: 'sharing', lastSent: null, lastError: null }));
        if (Date.now() - lastSentAt.current >= interval) void send(p);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setLoc({ kind: 'denied' });
        else setLoc({ kind: 'unavailable', msg: err.code === err.TIMEOUT ? 'GPS is taking too long. Move to open sky.' : 'GPS signal unavailable.' });
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
    );
    // Keep the screen awake while delivering; browsers pause GPS when the phone locks.
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (wakeLock.current = l)).catch(() => {});
    const resend = setInterval(() => {
      if (lastPos.current && Date.now() - lastSentAt.current >= interval) void send(lastPos.current);
    }, interval);
    return () => {
      clearInterval(resend);
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [shouldShare, interval, send]);

  async function toggleDuty() {
    const next = !onDuty;
    setOnDuty(next);
    try {
      await postJson('/api/rider/heartbeat', { onDuty: next });
      setToast({ msg: next ? 'You’re on duty. Dispatch can assign you deliveries.' : 'You’re off duty. Location sharing has stopped.' });
    } catch (e) {
      setOnDuty(!next);
      setToast({ msg: (e as Error).message, error: true });
    }
  }

  async function act(a: Assignment, action: string, extra: Record<string, unknown> = {}, okMsg?: string) {
    setBusy(a.orderId + action);
    try {
      await postJson(`/api/rider/orders/${a.orderId}`, { action, ...extra });
      setToast({ msg: okMsg ?? 'Updated' });
      if (action === 'picked_up' && lastPos.current) void send(lastPos.current);
      return true;
    } catch (e) {
      setToast({ msg: (e as Error).message, error: true });
      return false;
    } finally {
      setBusy(null);
      void refresh();
    }
  }

  const r = data?.restaurant;
  const staleData = lastSuccess ? Date.now() - lastSuccess > 60000 : true;

  return (
    <div className="rider">
      <header className="rider-top">
        <div className="duty">
          <div>
            <div style={{ fontWeight: 700 }}>{name}</div>
            <div className="small" style={{ color: '#e8dfd0' }} role="status">
              {status === 'live' && !staleData ? 'Connected' : staleData ? 'Connection problem: showing last loaded jobs' : 'Reconnecting…'}
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <span style={{ fontWeight: 700 }}>{onDuty ? 'On duty' : 'Off duty'}</span>
            <button className="switch" role="switch" aria-checked={!!onDuty} aria-label="On duty" onClick={toggleDuty} disabled={onDuty === null} />
          </div>
        </div>
      </header>

      {shouldShare && (
        <div style={{ margin: '12px 12px 0' }}>
          {loc.kind === 'asking' && <p className="alert info small">Allow location access so the customer and dispatch can follow this delivery. Location is only shared while you have an active delivery.</p>}
          {loc.kind === 'denied' && <p className="alert error small">Location is blocked. Open your browser settings for this site and allow location, then reload. You can still complete deliveries.</p>}
          {loc.kind === 'unavailable' && <p className="alert warn small">{loc.msg}</p>}
          {loc.kind === 'sharing' && (
            <p className={`alert ${loc.lastError ? 'warn' : 'ok'} small`} role="status">
              {loc.lastError ? `Location not sent: ${loc.lastError}. Retrying.` : loc.lastSent ? `Sharing location (last sent ${formatLocalTime(new Date(loc.lastSent), timezone)}). Keep this screen open.` : 'Getting GPS fix…'}
            </p>
          )}
        </div>
      )}

      <div className="tabs" style={{ margin: '8px 12px 0' }}>
        <a href="#jobs" aria-current={tab === 'jobs' ? 'page' : undefined} onClick={(e) => (e.preventDefault(), setTab('jobs'))}>
          Deliveries ({data?.assignments.length ?? 0})
        </a>
        <a href="#history" aria-current={tab === 'history' ? 'page' : undefined} onClick={(e) => (e.preventDefault(), setTab('history'))}>
          History
        </a>
      </div>

      {error && <p className="alert error" style={{ margin: 12 }}>{error}</p>}

      {tab === 'jobs' && (
        <>
          {!data && !error && (
            <p style={{ padding: 16 }}>
              <span className="spinner" /> Loading…
            </p>
          )}
          {data && data.assignments.length === 0 && (
            <div className="empty">
              <h3>No deliveries right now</h3>
              <p>{onDuty ? 'New assignments appear here automatically.' : 'Go on duty to receive deliveries.'}</p>
            </div>
          )}
          {data?.assignments.map((a) => {
            const fs = a.fulfillmentStatus;
            const toRestaurant = directionsUrl(r?.lat ?? null, r?.lng ?? null, r?.addressLine);
            const toCustomer = directionsUrl(a.lat, a.lng, [a.addressLine, a.landmark].filter(Boolean).join(', '));
            const isBusy = (x: string) => busy === a.orderId + x;
            return (
              <article key={a.orderId} className="job" aria-label={`Delivery ${a.orderNumber}`}>
                <div className="job-head">
                  <div>
                    <strong className="tnum" style={{ fontSize: '1.2rem' }}>
                      {a.orderNumber}
                    </strong>
                    <div className="small muted">
                      {a.itemCount} item(s) · ready by {formatLocalTime(a.promisedAt, timezone)}
                    </div>
                  </div>
                  <span className={`badge ${a.assignmentStatus === 'offered' ? 'warn' : 'info'}`}>{a.assignmentStatus === 'offered' ? 'New offer' : FULFILLMENT_STATUS_LABELS[fs] ?? fs}</span>
                </div>
                <div className="job-body">
                  {a.assignmentStatus === 'offered' ? (
                    <>
                      <p style={{ margin: 0 }}>
                        Delivery to <strong>{a.zoneName ?? 'customer'}</strong>. Accept to see the address and contact.
                      </p>
                      {a.riderFeePesewas ? <p style={{ margin: 0 }}>Your fee: {formatGHS(a.riderFeePesewas)}</p> : null}
                    </>
                  ) : (
                    <>
                      <div>
                        <div className="small muted">Pick up from</div>
                        <div className="addr">{r?.name}</div>
                        <div>{r?.addressLine}</div>
                      </div>
                      <div>
                        <div className="small muted">Deliver to {a.customerName}</div>
                        <div className="addr">{a.addressLine}</div>
                        {a.landmark && <div>Landmark: {a.landmark}</div>}
                        {a.instructions && <div className="alert info small" style={{ marginTop: 6 }}>{a.instructions}</div>}
                        {!a.locationVerified && <div className="alert warn small" style={{ marginTop: 6 }}>Location not GPS-verified. Call the customer to confirm.</div>}
                      </div>
                      {a.cashToCollectPesewas > 0 && (
                        <div className="cash-box">
                          Collect cash: {formatGHS(a.cashToCollectPesewas)}
                          <button className="btn sm" style={{ marginLeft: 10 }} disabled={isBusy('cash') || !['picked_up', 'on_the_way', 'arrived'].includes(fs)} onClick={() => act(a, 'cash', { amountPesewas: a.cashToCollectPesewas }, 'Cash recorded')}>
                            I’ve received the cash
                          </button>
                        </div>
                      )}
                      {a.kitchenStatus !== 'ready' && a.kitchenStatus !== 'handed_off' && <p className="hint" style={{ margin: 0 }}>Food not ready yet ({a.kitchenStatus}).</p>}
                    </>
                  )}
                </div>
                <div className="job-actions">
                  {a.assignmentStatus === 'offered' && (
                    <>
                      <button className="btn primary" disabled={isBusy('accept')} onClick={() => act(a, 'accept', {}, 'Accepted')}>
                        Accept delivery
                      </button>
                      {declineFor === a.orderId ? (
                        <div className="stack" style={{ ['--stack' as string]: '8px' }}>
                          <input className="input" placeholder="Reason (e.g. bike problem)" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
                          <button className="btn danger" disabled={!declineReason.trim()} onClick={async () => (await act(a, 'decline', { reason: declineReason }, 'Declined')) && (setDeclineFor(null), setDeclineReason(''))}>
                            Decline
                          </button>
                        </div>
                      ) : (
                        <button className="btn" onClick={() => setDeclineFor(a.orderId)}>
                          Decline
                        </button>
                      )}
                    </>
                  )}
                  {a.assignmentStatus === 'accepted' && (
                    <>
                      {(fs === 'accepted' || fs === 'assigned') && toRestaurant && (
                        <a className="btn leaf" href={toRestaurant} target="_blank" rel="noopener noreferrer">
                          <Icon name="nav" /> Navigate to restaurant
                        </a>
                      )}
                      {fs === 'accepted' && (
                        <button className="btn" disabled={isBusy('at_restaurant')} onClick={() => act(a, 'at_restaurant', {}, 'Marked at restaurant')}>
                          I’m at the restaurant
                        </button>
                      )}
                      {(fs === 'accepted' || fs === 'at_restaurant' || fs === 'assigned') && (
                        <button className="btn primary" disabled={isBusy('picked_up') || a.kitchenStatus !== 'ready'} onClick={() => act(a, 'picked_up', {}, 'Picked up. Safe riding!')}>
                          {a.kitchenStatus === 'ready' ? 'I’ve picked up the food' : 'Waiting for the kitchen'}
                        </button>
                      )}
                      {['picked_up', 'on_the_way', 'arrived'].includes(fs) && (
                        <>
                          {toCustomer && (
                            <a className="btn leaf" href={toCustomer} target="_blank" rel="noopener noreferrer">
                              <Icon name="nav" /> Navigate to customer
                            </a>
                          )}
                          {a.customerPhone && (
                            <a className="btn" href={`tel:${a.customerPhone}`}>
                              <Icon name="phone" /> Call customer
                            </a>
                          )}
                          {fs === 'picked_up' && (
                            <button className="btn" disabled={isBusy('on_the_way')} onClick={() => act(a, 'on_the_way', {}, 'On the way')}>
                              Start trip
                            </button>
                          )}
                          {fs !== 'arrived' && (
                            <button className="btn" disabled={isBusy('arrived')} onClick={() => act(a, 'arrived', {}, 'Marked arrived')}>
                              I’ve arrived
                            </button>
                          )}
                          {a.pinLocked ? (
                            <p className="alert error small">PIN locked after too many wrong attempts. Call dispatch to confirm this delivery.</p>
                          ) : (
                            <div className="stack" style={{ ['--stack' as string]: '8px' }}>
                              <label className="label" htmlFor={`pin-${a.orderId}`}>
                                Customer’s 4-digit PIN
                              </label>
                              <input
                                id={`pin-${a.orderId}`}
                                className="input pin-input"
                                inputMode="numeric"
                                pattern="\d{4}"
                                maxLength={4}
                                autoComplete="one-time-code"
                                value={pin[a.orderId] ?? ''}
                                onChange={(e) => setPin({ ...pin, [a.orderId]: e.target.value.replace(/\D/g, '') })}
                              />
                              <button
                                className="btn primary"
                                disabled={(pin[a.orderId] ?? '').length !== 4 || isBusy('deliver') || a.cashToCollectPesewas > 0}
                                onClick={async () => (await act(a, 'deliver', { pin: pin[a.orderId] }, 'Delivered!')) && setPin({ ...pin, [a.orderId]: '' })}
                              >
                                {a.cashToCollectPesewas > 0 ? 'Record the cash first' : 'Confirm delivery'}
                              </button>
                            </div>
                          )}
                          {failFor === a.orderId ? (
                            <div className="stack" style={{ ['--stack' as string]: '8px' }}>
                              <select className="select" value={failReason} onChange={(e) => setFailReason(e.target.value)}>
                                <option value="">Why couldn’t you deliver?</option>
                                <option>Customer unreachable</option>
                                <option>Customer not at address</option>
                                <option>Address not found</option>
                                <option>Customer refused the order</option>
                                <option>Accident or vehicle problem</option>
                                <option>Unsafe to continue</option>
                              </select>
                              <button className="btn danger" disabled={!failReason} onClick={async () => (await act(a, 'fail', { reason: failReason }, 'Reported to dispatch')) && (setFailFor(null), setFailReason(''))}>
                                Report failed delivery
                              </button>
                              <button className="btn ghost" onClick={() => setFailFor(null)}>
                                Back
                              </button>
                            </div>
                          ) : (
                            <button className="btn ghost" onClick={() => setFailFor(a.orderId)}>
                              I can’t deliver this order
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </>
      )}

      {tab === 'history' && (
        <div style={{ margin: 12 }}>
          {!data?.history.length ? (
            <p className="empty">No past deliveries yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Result</th>
                    <th className="num">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((h, i) => (
                    <tr key={i}>
                      <td>
                        {h.orderNumber}
                        <div className="small muted">{formatLocalTime(h.assignedAt, timezone)}</div>
                      </td>
                      <td>
                        {h.status}
                        {h.endReason && <div className="small muted">{h.endReason}</div>}
                      </td>
                      <td className="num">{h.riderFeePesewas != null ? formatGHS(h.riderFeePesewas) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{ margin: '24px 12px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {r?.phone && (
          <a className="btn" href={`tel:${r.phone}`}>
            <Icon name="phone" /> Call restaurant
          </a>
        )}
        <LogoutButton to="/rider/login" className="btn" />
      </div>
      {toast && (
        <div className={`kds-toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
