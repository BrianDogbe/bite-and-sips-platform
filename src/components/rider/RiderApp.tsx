'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLive, postJson } from '@/lib/use-live';
import { formatGHS } from '@/lib/money';
import { formatLocalTime, formatLocalDate, formatLocalDateTime } from '@/lib/time';
import { FULFILLMENT_STATUS_LABELS } from '@/lib/states';
import { directionsUrl } from '../shop/MapEmbed';
import { Icon } from '../Icon';
import { LogoutButton } from '../LoginForm';

const STEPS = ['Accepted', 'At restaurant', 'Picked up', 'Arrived'];
function stepIndex(fs: string) {
  if (fs === 'arrived') return 3;
  if (fs === 'picked_up' || fs === 'on_the_way') return 2;
  if (fs === 'at_restaurant') return 1;
  return 0;
}

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
interface Period {
  deliveries: number;
  feePesewas: number;
}
interface RiderStats {
  today: Period;
  week: Period;
  month: Period;
  cashCollectedTodayPesewas: number;
  cashToHandInPesewas: number;
  profile: { fullName: string; phone: string | null; email: string | null; vehicleType: string; vehiclePlate: string | null; memberSince: string; lastLoginAt: string | null };
  lifetime: { deliveries: number; feePesewas: number; failed: number; declined: number; completionRate: number | null; avgMinutes: number | null };
}

/** wa.me link for a Ghana phone number (0244… or +233244… both work). */
function waLink(phone: string) {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('0')) d = '233' + d.slice(1);
  return `https://wa.me/${d}`;
}

/** Short two-tone chime so a rider notices a new delivery even with the phone in a pocket. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1175].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * 0.25 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.25);
      o.stop(ctx.currentTime + i * 0.25 + 0.25);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {
    /* audio unavailable: the toast and vibration still show */
  }
}

interface RiderState {
  restaurant: { name: string; addressLine: string; lat: number | null; lng: number | null; phone: string; whatsapp: string };
  stats: RiderStats;
  assignments: Assignment[];
  history: { orderNumber: string; status: string; endReason: string | null; assignedAt: string; endedAt: string | null; riderFeePesewas: number | null; zoneName: string | null }[];
  onDuty: boolean;
  lastLocationAt: string | null;
  locationIntervalSeconds: number;
}

type LocState = { kind: 'idle' } | { kind: 'asking' } | { kind: 'denied' } | { kind: 'unavailable'; msg: string } | { kind: 'sharing'; lastSent: number | null; lastError: string | null };

export function RiderApp({ name, timezone, roleLabel = 'Rider' }: { name: string; timezone: string; roleLabel?: string }) {
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
  const [tab, setTab] = useState<'jobs' | 'earnings' | 'history' | 'profile'>('jobs');
  const [pwCur, setPwCur] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwNew2, setPwNew2] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<'password' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const seenOffers = useRef<Set<string> | null>(null);
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

  useEffect(() => {
    if (!menuOpen) return;
    const down = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [menuOpen]);
  useEffect(() => {
    if (!sheet) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(null);
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [sheet]);
  // New delivery offered: chime, vibrate and bring the Deliveries tab forward.
  useEffect(() => {
    if (!data) return;
    const offered = data.assignments.filter((a) => a.assignmentStatus === 'offered').map((a) => a.orderId);
    if (seenOffers.current === null) {
      seenOffers.current = new Set(offered);
      return;
    }
    const fresh = offered.filter((id) => !seenOffers.current!.has(id));
    offered.forEach((id) => seenOffers.current!.add(id));
    if (fresh.length) {
      chime();
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {
        /* vibration unsupported */
      }
      setToast({ msg: 'New delivery offered to you' });
      setTab('jobs');
    }
  }, [data]);

  async function savePassword() {
    if (pwNew !== pwNew2) {
      setToast({ msg: 'The new passwords do not match.', error: true });
      return;
    }
    try {
      await postJson('/api/rider/profile', { action: 'password', current: pwCur, next: pwNew });
      setPwCur('');
      setPwNew('');
      setPwNew2('');
      setSheet(null);
      setToast({ msg: 'Password changed' });
    } catch (e) {
      setToast({ msg: (e as Error).message, error: true });
    }
  }

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
      setToast({ msg: next ? 'You’re on duty. The kitchen can assign you deliveries.' : 'You’re off duty. Location sharing has stopped.' });
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
    <div className="rider rider-app">
      <header className="rider-top2">
        <div className="rt-menu" ref={menuRef}>
          <button type="button" className="rt-user" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            <span className="side-avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
            <span className="rt-user-text">
              <strong>{name}</strong>
              <span>{roleLabel}</span>
            </span>
            <svg className="bar-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {menuOpen && (
            <div className="bar-dropdown rt-dropdown" role="menu">
              <button type="button" role="menuitem" onClick={() => { setTab('profile'); setMenuOpen(false); }}>
                <Icon name="user" size={18} /> Profile
              </button>
              {r?.phone && (
                <a href={`tel:${r.phone}`} role="menuitem" onClick={() => setMenuOpen(false)}>
                  <Icon name="phone" size={18} /> Call restaurant
                </a>
              )}
              <LogoutButton to="/rider/login" className="bar-dropdown-out" />
            </div>
          )}
        </div>
        <div className="rt-duty">
          <div className="rt-duty-text">
            <strong>{onDuty ? 'On duty' : 'Off duty'}</strong>
            <span role="status" className={status === 'live' && !staleData ? 'ok' : 'bad'}>
              {status === 'live' && !staleData ? 'Connected' : staleData ? 'Connection problem' : 'Reconnecting…'}
            </span>
          </div>
          <button className="switch" role="switch" aria-checked={!!onDuty} aria-label="On duty" onClick={toggleDuty} disabled={onDuty === null} />
        </div>
      </header>

      {shouldShare && (
        <div style={{ margin: '12px 12px 0' }}>
          {loc.kind === 'asking' && <p className="alert info small">Allow location access so the customer and the restaurant can follow this delivery. Location is only shared while you have an active delivery.</p>}
          {loc.kind === 'denied' && <p className="alert error small">Location is blocked. Open your browser settings for this site and allow location, then reload. You can still complete deliveries.</p>}
          {loc.kind === 'unavailable' && <p className="alert warn small">{loc.msg}</p>}
          {loc.kind === 'sharing' && (
            <p className={`alert ${loc.lastError ? 'warn' : 'ok'} small`} role="status">
              {loc.lastError ? `Location not sent: ${loc.lastError}. Retrying.` : loc.lastSent ? `Sharing location (last sent ${formatLocalTime(new Date(loc.lastSent), timezone)}). Keep this screen open.` : 'Getting GPS fix…'}
            </p>
          )}
        </div>
      )}

      {error && <p className="alert error" style={{ margin: '12px 14px' }}>{error}</p>}

      {tab === 'jobs' && (
        <>
          {data?.stats && (
            <section className="rider-hero" aria-label="Today">
              <div className="rider-hero-main">
                <span>Earned today</span>
                <strong>{formatGHS(data.stats.today.feePesewas)}</strong>
              </div>
              <div className="rider-hero-row">
                <div>
                  <strong>{data.stats.today.deliveries}</strong>
                  <span>Deliveries</span>
                </div>
                <div>
                  <strong>{formatGHS(data.stats.cashCollectedTodayPesewas)}</strong>
                  <span>Cash collected</span>
                </div>
              </div>
              {data.stats.cashToHandInPesewas > 0 && (
                <button type="button" className="rider-hero-cash" onClick={() => setTab('earnings')}>
                  <Icon name="wallet" size={18} />
                  <span>Cash to hand in</span>
                  <strong>{formatGHS(data.stats.cashToHandInPesewas)}</strong>
                </button>
              )}
            </section>
          )}
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
                  <div className="job-title">
                    <strong className="tnum">{a.orderNumber}</strong>
                    <span className="small muted">{a.itemCount} item{a.itemCount === 1 ? '' : 's'} · ready by {formatLocalTime(a.promisedAt, timezone)}</span>
                  </div>
                  <span className={`badge ${a.assignmentStatus === 'offered' ? 'warn' : 'info'}`}>{a.assignmentStatus === 'offered' ? 'New offer' : FULFILLMENT_STATUS_LABELS[fs] ?? fs}</span>
                </div>
                {a.assignmentStatus === 'accepted' && (
                  <ol className="job-steps" aria-label="Progress">
                    {STEPS.map((label, i) => (
                      <li key={label} className={i < stepIndex(fs) ? 'done' : i === stepIndex(fs) ? 'now' : ''}>
                        <span aria-hidden="true" />
                        {label}
                      </li>
                    ))}
                  </ol>
                )}
                <div className="job-body">
                  {a.assignmentStatus === 'offered' ? (
                    <>
                      <p style={{ margin: 0 }}>
                        Delivery to <strong>{a.zoneName ?? 'customer'}</strong>. Accept to see the address and contact.
                      </p>
                      {a.riderFeePesewas ? <span className="job-chip fee">Your fee {formatGHS(a.riderFeePesewas)}</span> : null}
                    </>
                  ) : (
                    <>
                      <div className="job-route">
                        <div className="job-stop">
                          <span className="job-dot pick" aria-hidden="true" />
                          <div className="job-stop-text">
                            <span className="small muted">Pick up</span>
                            <strong className="addr">{r?.name}</strong>
                            <span>{r?.addressLine}</span>
                          </div>
                          {r?.phone && (
                            <div className="job-contact">
                              <a className="job-ico" href={`tel:${r.phone}`} aria-label="Call restaurant"><Icon name="phone" size={18} /></a>
                              <a className="job-ico" href={waLink(r.whatsapp || r.phone)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp restaurant"><Icon name="chat" size={18} /></a>
                            </div>
                          )}
                        </div>
                        <div className="job-stop">
                          <span className="job-dot drop" aria-hidden="true" />
                          <div className="job-stop-text">
                            <span className="small muted">Drop off · {a.customerName}</span>
                            <strong className="addr">{a.addressLine}</strong>
                            {a.landmark && <span>Landmark: {a.landmark}</span>}
                          </div>
                          {a.customerPhone && (
                            <div className="job-contact">
                              <a className="job-ico" href={`tel:${a.customerPhone}`} aria-label="Call customer"><Icon name="phone" size={18} /></a>
                              <a className="job-ico" href={waLink(a.customerPhone)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp customer"><Icon name="chat" size={18} /></a>
                            </div>
                          )}
                        </div>
                      </div>
                      {(a.riderFeePesewas || a.cashToCollectPesewas > 0) && (
                        <div className="job-chips">
                          {a.riderFeePesewas ? <span className="job-chip fee">Your fee {formatGHS(a.riderFeePesewas)}</span> : null}
                          {a.cashToCollectPesewas > 0 && <span className="job-chip cash">Collect {formatGHS(a.cashToCollectPesewas)} cash</span>}
                        </div>
                      )}
                      {a.instructions && <div className="alert info small" style={{ margin: 0 }}>{a.instructions}</div>}
                      {!a.locationVerified && <div className="alert warn small" style={{ margin: 0 }}>Location not GPS-verified. Call the customer to confirm.</div>}
                      {a.cashToCollectPesewas > 0 && ['picked_up', 'on_the_way', 'arrived'].includes(fs) && (
                        <button className="btn" disabled={isBusy('cash')} onClick={() => act(a, 'cash', { amountPesewas: a.cashToCollectPesewas }, 'Cash recorded')}>
                          I’ve received {formatGHS(a.cashToCollectPesewas)} cash
                        </button>
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
                            <p className="alert error small">PIN locked after too many wrong attempts. Call the restaurant to confirm this delivery.</p>
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

      {tab === 'earnings' && (
        <div className="rider-earn">
          {!data?.stats ? (
            <p className="empty">Loading…</p>
          ) : (
            <>
              {([['Today', data.stats.today], ['This week', data.stats.week], ['This month', data.stats.month]] as [string, Period][]).map(([label, p]) => (
                <div key={label} className="rider-earn-card">
                  <span className="rider-earn-label">{label}</span>
                  <strong>{formatGHS(p.feePesewas)}</strong>
                  <span className="small muted">{p.deliveries} {p.deliveries === 1 ? 'delivery' : 'deliveries'} completed</span>
                </div>
              ))}
              <div className="rider-earn-card cash">
                <span className="rider-earn-label">Cash to hand in</span>
                <strong>{formatGHS(data.stats.cashToHandInPesewas)}</strong>
                <span className="small muted">Cash you collected from customers and have not yet given to the restaurant.</span>
              </div>
              <p className="hint">Earnings count completed deliveries and the fee set for each one.</p>
            </>
          )}
        </div>
      )}

      {tab === 'profile' && (
        <div className="rider-profile">
          <section className="rp-card">
            <span className="side-avatar rp-avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
            <strong>{data?.stats.profile.fullName ?? name}</strong>
            <span className="rp-role">{roleLabel}</span>
            <span className={`rp-status ${onDuty ? 'on' : ''}`}>{onDuty ? 'On duty now' : 'Off duty'}</span>
            {data?.stats && <span className="small muted">Member since {formatLocalDate(data.stats.profile.memberSince, timezone)}</span>}
          </section>
          {data?.stats && (
            <section className="rp-group" aria-label="Your numbers">
              <h2>Your numbers</h2>
              <div className="rp-tiles">
                <div><strong>{data.stats.lifetime.deliveries}</strong><span>Deliveries completed</span></div>
                <div><strong>{formatGHS(data.stats.lifetime.feePesewas)}</strong><span>Total earned</span></div>
                <div><strong>{data.stats.lifetime.completionRate != null ? `${data.stats.lifetime.completionRate}%` : '–'}</strong><span>Delivered successfully</span></div>
                <div><strong>{data.stats.lifetime.avgMinutes != null ? `${data.stats.lifetime.avgMinutes} min` : '–'}</strong><span>Average time per delivery</span></div>
              </div>
              {(data.stats.lifetime.failed > 0 || data.stats.lifetime.declined > 0) && (
                <p className="rp-foot">{data.stats.lifetime.failed} failed · {data.stats.lifetime.declined} declined</p>
              )}
            </section>
          )}
          <section className="rp-group" aria-label="Account">
            <h2>Account</h2>
            <dl className="rp-dl">
              <div><dt>Name</dt><dd>{data?.stats.profile.fullName ?? name}</dd></div>
              <div><dt>Role</dt><dd>{roleLabel}</dd></div>
              {data?.stats.profile.phone && <div><dt>Phone</dt><dd>{data.stats.profile.phone}</dd></div>}
              {data?.stats.profile.email && <div><dt>Email</dt><dd>{data.stats.profile.email}</dd></div>}
              {data?.stats.profile.lastLoginAt && <div><dt>Last sign-in</dt><dd>{formatLocalDateTime(data.stats.profile.lastLoginAt, timezone)}</dd></div>}
            </dl>
          </section>
          {r && (
            <section className="rp-group" aria-label="Restaurant">
              <h2>Restaurant</h2>
              <dl className="rp-dl">
                <div><dt>Name</dt><dd>{r.name}</dd></div>
                <div><dt>Address</dt><dd>{r.addressLine}</dd></div>
                {r.phone && <div><dt>Phone</dt><dd>{r.phone}</dd></div>}
                {r.whatsapp && <div><dt>WhatsApp</dt><dd>{r.whatsapp}</dd></div>}
              </dl>
            </section>
          )}
          <section className="rp-group" aria-label="Settings">
            <h2>Settings</h2>
            <button type="button" className="rp-row" onClick={() => setSheet('password')}>
              <span className="rp-row-ico"><Icon name="shield" size={20} /></span>
              <span className="rp-row-text">
                <strong>Change password</strong>
                <span>Keep your account secure</span>
              </span>
              <svg className="rp-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            </button>
            {r?.phone && (
              <a className="rp-row" href={`tel:${r.phone}`}>
                <span className="rp-row-ico"><Icon name="phone" size={20} /></span>
                <span className="rp-row-text">
                  <strong>Call the restaurant</strong>
                  <span>{r.phone}</span>
                </span>
                <svg className="rp-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
              </a>
            )}
          </section>
          <p className="hint rp-note">To change your name or phone number, ask the restaurant.</p>
          <LogoutButton to="/rider/login" className="rp-signout" />
        </div>
      )}

      {sheet === 'password' && (
        <div className="rider-sheet-wrap" onClick={() => setSheet(null)}>
          <div className="rider-sheet" role="dialog" aria-modal="true" aria-label="Change password" onClick={(e) => e.stopPropagation()}>
            <div className="rider-sheet-head">
              <h2>Change password</h2>
              <button type="button" className="rider-sheet-x" aria-label="Close" onClick={() => setSheet(null)}>×</button>
            </div>
            <div className="field">
              <label htmlFor="rp-cur">Current password</label>
              <input id="rp-cur" className="input" type="password" autoComplete="current-password" value={pwCur} onChange={(e) => setPwCur(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rp-new">New password</label>
              <input id="rp-new" className="input" type="password" autoComplete="new-password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rp-new2">Repeat new password</label>
              <input id="rp-new2" className="input" type="password" autoComplete="new-password" value={pwNew2} onChange={(e) => setPwNew2(e.target.value)} />
            </div>
            <button type="button" className="btn primary block" disabled={!pwCur || !pwNew || !pwNew2} onClick={savePassword}>Change password</button>
          </div>
        </div>
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

      <nav className="rider-nav" aria-label="Rider app">
        {([['jobs', 'Deliveries', 'bike'], ['earnings', 'Earnings', 'wallet'], ['history', 'History', 'clock'], ['profile', 'Profile', 'user']] as const).map(([k, label, icon]) => (
          <button key={k} type="button" aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>
            <span className="rider-nav-ico">
              <Icon name={icon} size={22} />
              {k === 'jobs' && (data?.assignments.length ?? 0) > 0 && <span className="rider-nav-badge">{data!.assignments.length}</span>}
            </span>
            {label}
          </button>
        ))}
      </nav>
      {toast && (
        <div className={`kds-toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
