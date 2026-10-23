'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLive, postJson } from '@/lib/use-live';
import { formatGHS } from '@/lib/money';
import { formatLocalTime, formatLocalDate, formatLocalDateTime } from '@/lib/time';
import { FULFILLMENT_STATUS_LABELS } from '@/lib/states';
import { directionsUrl } from '../shop/MapEmbed';
import { Icon } from '../Icon';
import { LogoutButton } from '../LoginForm';
import { C_BAR_CARET, C_BAR_DROPDOWN, C_BAR_DROPDOWN_OUT, C_JOB_CHIP, C_JOB_ICO, C_RP_GROUP, C_SIDE_AVATAR } from '@/components/ui';

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
  const { data, status, error, signedOut, lastSuccess, refresh } = useLive<RiderState>({ url: '/api/rider/state', topics: ['rider'], pollMs: 15000 });
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
    <div className="[--font-display:var(--font-body)] [background:var(--ivory)] [min-height:100dvh] [padding-bottom:32px] [font-size:1.05rem] [&_h1]:font-extrabold [&_h1]:[letter-spacing:-0.01em] [&_h2]:font-extrabold [&_h2]:[letter-spacing:-0.01em] [&_h3]:font-extrabold [&_h3]:[letter-spacing:-0.01em] [max-width:480px] [margin:0_auto] [min-height:100dvh] [padding-bottom:calc(92px_+_env(safe-area-inset-bottom))] [font-size:1rem] [box-shadow:0_0_0_1px_var(--line)] [&_.job]:[margin:12px_14px] [&_.job]:[border-radius:18px] [&_.job]:[box-shadow:0_4px_14px_rgba(53,_37,_31,_.07)] [&_.empty]:[margin:24px_14px] rider-app">
      <header className="sticky [top:0] [z-index:20] flex items-center justify-between [gap:12px] [padding:12px_14px] [background:var(--espresso)] [color:#fff]">
        <div className="relative [min-width:0]" ref={menuRef}>
          <button type="button" className="flex items-center [gap:10px] [padding:4px_8px_4px_4px] border-0 rounded-full bg-transparent [color:#fff] [font:inherit] text-left cursor-pointer [max-width:100%] hover:[background:rgba(255,_255,_255,_.12)] aria-expanded:[background:rgba(255,_255,_255,_.12)] rt-user" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            <span className={C_SIDE_AVATAR} aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
            <span className="grid [line-height:1.2] [min-width:0] [&_strong]:[font-size:.98rem] [&_strong]:whitespace-nowrap [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_span]:[font-size:.8rem] [&_span]:[color:rgba(255,_255,_255,_.72)]">
              <strong>{name}</strong>
              <span>{roleLabel}</span>
            </span>
            <svg className={C_BAR_CARET} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {menuOpen && (
            <div className={`${C_BAR_DROPDOWN} bar-dropdown [left:0] [right:auto] [min-width:220px]`} role="menu">
              <button type="button" role="menuitem" onClick={() => { setTab('profile'); setMenuOpen(false); }}>
                <Icon name="user" size={18} /> Profile
              </button>
              {r?.phone && (
                <a href={`tel:${r.phone}`} role="menuitem" onClick={() => setMenuOpen(false)}>
                  <Icon name="phone" size={18} /> Call restaurant
                </a>
              )}
              <LogoutButton to="/rider/login" className={C_BAR_DROPDOWN_OUT} />
            </div>
          )}
        </div>
        <div className="flex items-center [gap:10px] flex-none">
          <div className="grid text-right [line-height:1.2] [&_strong]:[font-size:.95rem] [&_span]:[font-size:.74rem] [&_span]:[color:rgba(255,_255,_255,_.7)] [&_span.ok::before]:[content:''] [&_span.ok::before]:inline-block [&_span.ok::before]:[width:7px] [&_span.ok::before]:[height:7px] [&_span.ok::before]:[margin-right:5px] [&_span.ok::before]:rounded-[50%] [&_span.ok::before]:[background:#6fcf8f] [&_span.ok::before]:[vertical-align:1px] rt-duty-text">
            <strong>{onDuty ? 'On duty' : 'Off duty'}</strong>
            <span role="status" className={status === 'live' && !staleData ? 'ok' : `[.rt-duty-text_span&::before]:[content:''] [.rt-duty-text_span&::before]:inline-block [.rt-duty-text_span&::before]:[width:7px] [.rt-duty-text_span&::before]:[height:7px] [.rt-duty-text_span&::before]:[margin-right:5px] [.rt-duty-text_span&::before]:rounded-[50%] [.rt-duty-text_span&::before]:[vertical-align:1px] [.rt-duty-text_span&::before]:[background:#f0a35e]`}>
              {signedOut ? 'Signed out' : status === 'live' && !staleData ? 'Connected' : staleData ? 'Connection problem' : 'Reconnecting…'}
            </span>
          </div>
          <button className="relative [width:64px] [height:36px] rounded-full border-0 [background:#9a9288] cursor-pointer flex-none [&::after]:[content:''] [&::after]:absolute [&::after]:[top:4px] [&::after]:[left:4px] [&::after]:[width:28px] [&::after]:[height:28px] [&::after]:rounded-[50%] [&::after]:[background:#fff] [&::after]:[transition:transform_0.15s] aria-checked:[background:var(--status-ready)] [&[aria-checked=true]::after]:[transform:translateX(28px)]" role="switch" aria-checked={!!onDuty} aria-label="On duty" onClick={toggleDuty} disabled={onDuty === null} />
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

      {signedOut ? (
        <section role="alert" className="grid [gap:12px] [margin:12px_14px] [padding:16px] [background:var(--danger-bg)] [border:2px_solid_var(--danger)] [border-radius:16px] [color:#7a1a12]">
          <div className="grid [gap:4px]">
            <strong className="[font-size:1.15rem]">You’ve been signed out</strong>
            <span>You won’t get new deliveries or updates until you sign in again. Any delivery you’ve accepted stays assigned to you.</span>
          </div>
          <a className="btn primary [min-height:52px] [font-size:1.05rem]" href="/rider/login">
            Sign in again
          </a>
        </section>
      ) : (
        error && <p className="alert error" style={{ margin: '12px 14px' }}>{error}</p>
      )}

      {tab === 'jobs' && (
        <>
          {data?.stats && (
            <section className="[margin:14px] [padding:18px] grid [gap:14px] [background:var(--espresso)] [color:#fff] [border-radius:20px] [box-shadow:0_10px_24px_rgba(53,_37,_31,_.18)]" aria-label="Today">
              <div className="grid [gap:2px] [&_span]:[font-size:.78rem] [&_span]:font-bold [&_span]:[letter-spacing:.08em] [&_span]:uppercase [&_span]:[color:rgba(255,_255,_255,_.7)] [&_strong]:[font-size:2.1rem] [&_strong]:[line-height:1.1]">
                <span>Earned today</span>
                <strong>{formatGHS(data.stats.today.feePesewas)}</strong>
              </div>
              <div className="grid [grid-template-columns:1fr_1fr] [gap:10px] [&_>_div]:grid [&_>_div]:[gap:2px] [&_>_div]:[padding:10px_12px] [&_>_div]:[background:rgba(255,_255,_255,_.1)] [&_>_div]:[border-radius:12px] [&_strong]:[font-size:1.1rem] [&_span]:[font-size:.76rem] [&_span]:[color:rgba(255,_255,_255,_.72)]">
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
                <button type="button" className="flex items-center [gap:10px] [width:100%] [padding:11px_14px] border-0 [border-radius:12px] [background:var(--caramel-tint)] [color:var(--caramel-text)] [font:inherit] [&]:font-bold text-left cursor-pointer [&_span]:flex-1" onClick={() => setTab('earnings')}>
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
              <article key={a.orderId} className="[background:var(--surface)] [border-radius:var(--r-lg)] [margin:14px_12px] [border:1px_solid_var(--line)] overflow-hidden job" aria-label={`Delivery ${a.orderNumber}`}>
                <div className="[padding:14px_16px] flex justify-between items-center [border-bottom:1px_solid_var(--line)] [.rider-app_&]:[padding:14px_16px_12px] [.rider-app_&]:[border-bottom:0]">
                  <div className="grid [gap:2px] [&_strong]:[font-size:1.15rem] [&_strong]:[letter-spacing:.01em]">
                    <strong className="tnum">{a.orderNumber}</strong>
                    <span className="small muted">{a.itemCount} item{a.itemCount === 1 ? '' : 's'} · ready by {formatLocalTime(a.promisedAt, timezone)}</span>
                  </div>
                  <span className={`badge ${a.assignmentStatus === 'offered' ? 'warn' : 'info'}`}>{a.assignmentStatus === 'offered' ? 'New offer' : FULFILLMENT_STATUS_LABELS[fs] ?? fs}</span>
                </div>
                {a.assignmentStatus === 'accepted' && (
                  <ol className="list-none m-0 [padding:0_16px_14px] grid [grid-template-columns:repeat(4,_1fr)] [gap:4px] [border-bottom:1px_solid_var(--line)] [&_li]:relative [&_li]:grid [&_li]:[justify-items:center] [&_li]:[gap:6px] [&_li]:[padding-top:2px] [&_li]:[font-size:.68rem] [&_li]:font-semibold [&_li]:text-center [&_li]:[color:var(--muted)] [&_li_span]:relative [&_li_span]:[z-index:1] [&_li_span]:[width:14px] [&_li_span]:[height:14px] [&_li_span]:rounded-[50%] [&_li_span]:[background:#fff] [&_li_span]:[border:2px_solid_var(--line-strong)] [&_li::before]:[content:''] [&_li::before]:absolute [&_li::before]:[top:9px] [&_li::before]:[right:50%] [&_li::before]:[width:100%] [&_li::before]:[height:2px] [&_li::before]:[background:var(--line-strong)] [&_li:first-child::before]:hidden [&_li.done_span]:[background:var(--sage-dark)] [&_li.done_span]:[border-color:var(--sage-dark)] [&_li.done::before]:[background:var(--sage-dark)] [&_li.now::before]:[background:var(--sage-dark)] [&&_li.now_span]:[background:#fff] [&_li.now_span]:[border-color:var(--sage-dark)] [&_li.now_span]:[box-shadow:0_0_0_4px_var(--sage-tint)] [&_li.now]:[color:var(--ink)] [&_li.done]:[color:var(--ink)]" aria-label="Progress">
                    {STEPS.map((label, i) => (
                      <li key={label} className={i < stepIndex(fs) ? 'done' : i === stepIndex(fs) ? 'now' : ''}>
                        <span aria-hidden="true" />
                        {label}
                      </li>
                    ))}
                  </ol>
                )}
                <div className="[padding:14px_16px] grid [gap:12px] [.rider-app_&]:[padding:14px_16px] [.rider-app_&]:[gap:12px]">
                  {a.assignmentStatus === 'offered' ? (
                    <>
                      <p style={{ margin: 0 }}>
                        Delivery to <strong>{a.zoneName ?? 'customer'}</strong>. Accept to see the address and contact.
                      </p>
                      {a.riderFeePesewas ? <span className={`${C_JOB_CHIP} fee`}>Your fee {formatGHS(a.riderFeePesewas)}</span> : null}
                    </>
                  ) : (
                    <>
                      <div className="relative grid [gap:16px] [&::before]:[content:''] [&::before]:absolute [&::before]:[left:6px] [&::before]:[top:16px] [&::before]:[bottom:16px] [&::before]:[border-left:2px_dashed_var(--line-strong)]">
                        <div className="relative flex items-start [gap:12px]">
                          <span className="flex-none [width:14px] [height:14px] [margin-top:4px] rounded-[50%] [background:#fff] [border:3px_solid_var(--sage-dark)] [z-index:1] [&.drop]:[border-color:var(--caramel-text)] [&.drop]:[background:var(--caramel-text)] pick" aria-hidden="true" />
                          <div className="grid [gap:1px] [min-width:0] flex-1 job-stop-text">
                            <span className="small muted">Pick up</span>
                            <strong className="[font-size:1.15rem] font-bold [.job-stop-text_&]:[font-size:1.02rem]">{r?.name}</strong>
                            <span>{r?.addressLine}</span>
                          </div>
                          {r?.phone && (
                            <div className="flex [gap:6px] flex-none">
                              <a className={C_JOB_ICO} href={`tel:${r.phone}`} aria-label="Call restaurant"><Icon name="phone" size={18} /></a>
                              <a className={C_JOB_ICO} href={waLink(r.whatsapp || r.phone)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp restaurant"><Icon name="chat" size={18} /></a>
                            </div>
                          )}
                        </div>
                        <div className="relative flex items-start [gap:12px]">
                          <span className="flex-none [width:14px] [height:14px] [margin-top:4px] rounded-[50%] [background:#fff] [border:3px_solid_var(--sage-dark)] [z-index:1] [&.drop]:[border-color:var(--caramel-text)] [&.drop]:[background:var(--caramel-text)] drop" aria-hidden="true" />
                          <div className="grid [gap:1px] [min-width:0] flex-1 job-stop-text">
                            <span className="small muted">Drop off · {a.customerName}</span>
                            <strong className="[font-size:1.15rem] font-bold [.job-stop-text_&]:[font-size:1.02rem]">{a.addressLine}</strong>
                            {a.landmark && <span>Landmark: {a.landmark}</span>}
                          </div>
                          {a.customerPhone && (
                            <div className="flex [gap:6px] flex-none">
                              <a className={C_JOB_ICO} href={`tel:${a.customerPhone}`} aria-label="Call customer"><Icon name="phone" size={18} /></a>
                              <a className={C_JOB_ICO} href={waLink(a.customerPhone)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp customer"><Icon name="chat" size={18} /></a>
                            </div>
                          )}
                        </div>
                      </div>
                      {(a.riderFeePesewas || a.cashToCollectPesewas > 0) && (
                        <div className="flex flex-wrap [gap:8px]">
                          {a.riderFeePesewas ? <span className={`${C_JOB_CHIP} fee`}>Your fee {formatGHS(a.riderFeePesewas)}</span> : null}
                          {a.cashToCollectPesewas > 0 && <span className={`${C_JOB_CHIP} cash`}>Collect {formatGHS(a.cashToCollectPesewas)} cash</span>}
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
                <div className="[padding:0_16px_16px] grid [gap:10px] [&_.btn]:[min-height:58px] [&_.btn]:[font-size:1.12rem] [.rider-app_&]:[padding:0_16px_16px] [.rider-app_&_.btn]:[min-height:52px] [.rider-app_&_.btn]:[font-size:1.02rem] [.rider-app_&_.btn]:[border-radius:14px]">
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
                                className="input [font-size:2rem] [letter-spacing:0.4em] text-center tabular-nums font-extrabold"
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
        <div className="grid [gap:10px] [margin:12px] [.rider-app_&]:[margin:14px]">
          {!data?.stats ? (
            <p className="empty">Loading…</p>
          ) : (
            <>
              {([['Today', data.stats.today], ['This week', data.stats.week], ['This month', data.stats.month]] as [string, Period][]).map(([label, p]) => (
                <div key={label} className="grid [gap:2px] [padding:14px_16px] [background:#fff] [border:1px_solid_var(--line)] [border-radius:14px] [&_strong]:[font-size:1.6rem] [&_strong]:[color:var(--espresso)] [&.cash]:[background:var(--caramel-tint)] [&.cash]:[border-color:transparent] [&.cash_strong]:[color:var(--caramel-text)]">
                  <span className="[font-size:.78rem] font-bold [letter-spacing:.06em] uppercase [color:var(--muted)]">{label}</span>
                  <strong>{formatGHS(p.feePesewas)}</strong>
                  <span className="small muted">{p.deliveries} {p.deliveries === 1 ? 'delivery' : 'deliveries'} completed</span>
                </div>
              ))}
              <div className="grid [gap:2px] [padding:14px_16px] [background:#fff] [border:1px_solid_var(--line)] [border-radius:14px] [&_strong]:[font-size:1.6rem] [&_strong]:[color:var(--espresso)] [&.cash]:[background:var(--caramel-tint)] [&.cash]:[border-color:transparent] [&.cash_strong]:[color:var(--caramel-text)] cash">
                <span className="[font-size:.78rem] font-bold [letter-spacing:.06em] uppercase [color:var(--muted)]">Cash to hand in</span>
                <strong>{formatGHS(data.stats.cashToHandInPesewas)}</strong>
                <span className="small muted">Cash you collected from customers and have not yet given to the restaurant.</span>
              </div>
              <p className="hint">Earnings count completed deliveries and the fee set for each one.</p>
            </>
          )}
        </div>
      )}

      {tab === 'profile' && (
        <div className="grid [gap:12px] [margin:12px] [&_.panel]:grid [&_.panel]:[gap:12px] [&_h2]:m-0 [&_h2]:[font-size:1.05rem] [.rider-app_&]:grid [.rider-app_&]:[gap:14px] [.rider-app_&]:[margin:14px]">
          <section className="grid [justify-items:center] [gap:4px] [padding:22px_16px] [background:#fff] [border:1px_solid_var(--line)] [border-radius:18px] text-center [&_strong]:[font-size:1.15rem]">
            <span className={`${C_SIDE_AVATAR} [width:64px] [height:64px] [font-size:1.5rem] [margin-bottom:6px]`} aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
            <strong>{data?.stats.profile.fullName ?? name}</strong>
            <span className="[padding:3px_12px] rounded-full [background:var(--sage-tint)] [color:var(--sage-dark)] [font-size:.8rem] font-bold">{roleLabel}</span>
            <span className={`[padding:3px_12px] rounded-full [background:var(--ivory-2)] [color:var(--muted)] [font-size:.8rem] font-bold [&.on]:[background:var(--sage-tint)] [&.on]:[color:var(--sage-dark)] ${onDuty ? 'on' : ''}`}>{onDuty ? 'On duty now' : 'Off duty'}</span>
            {data?.stats && <span className="small muted">Member since {formatLocalDate(data.stats.profile.memberSince, timezone)}</span>}
          </section>
          {data?.stats && (
            <section className={C_RP_GROUP} aria-label="Your numbers">
              <h2>Your numbers</h2>
              <div className="grid [grid-template-columns:1fr_1fr] [gap:1px] [background:var(--line)] [border-top:1px_solid_var(--line)] [&_>_div]:grid [&_>_div]:[gap:2px] [&_>_div]:[padding:14px_16px] [&_>_div]:[background:#fff] [&_strong]:[font-size:1.25rem] [&_strong]:[color:var(--espresso)] [&_span]:[font-size:.8rem] [&_span]:[color:var(--muted)]">
                <div><strong>{data.stats.lifetime.deliveries}</strong><span>Deliveries completed</span></div>
                <div><strong>{formatGHS(data.stats.lifetime.feePesewas)}</strong><span>Total earned</span></div>
                <div><strong>{data.stats.lifetime.completionRate != null ? `${data.stats.lifetime.completionRate}%` : '–'}</strong><span>Delivered successfully</span></div>
                <div><strong>{data.stats.lifetime.avgMinutes != null ? `${data.stats.lifetime.avgMinutes} min` : '–'}</strong><span>Average time per delivery</span></div>
              </div>
              {(data.stats.lifetime.failed > 0 || data.stats.lifetime.declined > 0) && (
                <p className="m-0 [padding:10px_16px] [border-top:1px_solid_var(--line)] [font-size:.84rem] [color:var(--muted)]">{data.stats.lifetime.failed} failed · {data.stats.lifetime.declined} declined</p>
              )}
            </section>
          )}
          <section className={C_RP_GROUP} aria-label="Account">
            <h2>Account</h2>
            <dl className="m-0 grid [&_>_div]:flex [&_>_div]:justify-between [&_>_div]:[gap:16px] [&_>_div]:[padding:12px_16px] [&_>_div]:[border-top:1px_solid_var(--line)] [&_dt]:[color:var(--muted)] [&_dt]:flex-none [&_dd]:m-0 [&_dd]:font-semibold [&_dd]:text-right [&_dd]:[min-width:0] [&_dd]:[overflow-wrap:anywhere]">
              <div><dt>Name</dt><dd>{data?.stats.profile.fullName ?? name}</dd></div>
              <div><dt>Role</dt><dd>{roleLabel}</dd></div>
              {data?.stats.profile.phone && <div><dt>Phone</dt><dd>{data.stats.profile.phone}</dd></div>}
              {data?.stats.profile.email && <div><dt>Email</dt><dd>{data.stats.profile.email}</dd></div>}
              {data?.stats.profile.lastLoginAt && <div><dt>Last sign-in</dt><dd>{formatLocalDateTime(data.stats.profile.lastLoginAt, timezone)}</dd></div>}
            </dl>
          </section>
          {r && (
            <section className={C_RP_GROUP} aria-label="Restaurant">
              <h2>Restaurant</h2>
              <dl className="m-0 grid [&_>_div]:flex [&_>_div]:justify-between [&_>_div]:[gap:16px] [&_>_div]:[padding:12px_16px] [&_>_div]:[border-top:1px_solid_var(--line)] [&_dt]:[color:var(--muted)] [&_dt]:flex-none [&_dd]:m-0 [&_dd]:font-semibold [&_dd]:text-right [&_dd]:[min-width:0] [&_dd]:[overflow-wrap:anywhere]">
                <div><dt>Name</dt><dd>{r.name}</dd></div>
                <div><dt>Address</dt><dd>{r.addressLine}</dd></div>
                {r.phone && <div><dt>Phone</dt><dd>{r.phone}</dd></div>}
                {r.whatsapp && <div><dt>WhatsApp</dt><dd>{r.whatsapp}</dd></div>}
              </dl>
            </section>
          )}
          <section className={C_RP_GROUP} aria-label="Settings">
            <h2>Settings</h2>
            <button type="button" className="flex items-center [gap:12px] [width:100%] [padding:13px_16px] border-0 [&]:[border-top:1px_solid_var(--line)] bg-transparent [color:var(--ink)] [font:inherit] text-left no-underline cursor-pointer hover:[background:var(--ivory)]" onClick={() => setSheet('password')}>
              <span className="grid place-items-center flex-none [width:40px] [height:40px] [border-radius:12px] [background:var(--sage-tint)] [color:var(--sage-dark)]"><Icon name="shield" size={20} /></span>
              <span className="grid flex-1 [min-width:0] [line-height:1.3] [&_span]:[font-size:.84rem] [&_span]:[color:var(--muted)]">
                <strong>Change password</strong>
                <span>Keep your account secure</span>
              </span>
              <svg className="flex-none [color:var(--muted)]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            </button>
            {r?.phone && (
              <a className="flex items-center [gap:12px] [width:100%] [padding:13px_16px] border-0 [&]:[border-top:1px_solid_var(--line)] bg-transparent [color:var(--ink)] [font:inherit] text-left no-underline cursor-pointer hover:[background:var(--ivory)]" href={`tel:${r.phone}`}>
                <span className="grid place-items-center flex-none [width:40px] [height:40px] [border-radius:12px] [background:var(--sage-tint)] [color:var(--sage-dark)]"><Icon name="phone" size={20} /></span>
                <span className="grid flex-1 [min-width:0] [line-height:1.3] [&_span]:[font-size:.84rem] [&_span]:[color:var(--muted)]">
                  <strong>Call the restaurant</strong>
                  <span>{r.phone}</span>
                </span>
                <svg className="flex-none [color:var(--muted)]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
              </a>
            )}
          </section>
          <p className="hint [margin:0_4px] text-center">To change your name or phone number, ask the restaurant.</p>
          <LogoutButton to="/rider/login" className="[width:100%] [min-height:50px] [border-radius:14px] [border:1px_solid_var(--line-strong)] [background:#fff] [color:var(--danger)] [font:inherit] [&]:font-bold cursor-pointer" />
        </div>
      )}

      {sheet === 'password' && (
        <div className="fixed [inset:0] [z-index:60] flex items-end justify-center [background:rgba(53,_37,_31,_.45)]" onClick={() => setSheet(null)}>
          <div className="[width:100%] [max-width:480px] grid [gap:14px] [padding:18px_18px_calc(20px_+_env(safe-area-inset-bottom))] [background:#fff] [border-radius:22px_22px_0_0] [box-shadow:0_-10px_30px_rgba(53,_37,_31,_.2)] [@media(max-height:480px)_and_(orientation:landscape)]:[max-height:92vh] [@media(max-height:480px)_and_(orientation:landscape)]:overflow-y-auto" role="dialog" aria-modal="true" aria-label="Change password" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between [&_h2]:m-0 [&_h2]:[font-size:1.15rem]">
              <h2>Change password</h2>
              <button type="button" className="[width:36px] [height:36px] border-0 rounded-[50%] [background:var(--ivory-2)] [font-size:1.4rem] [line-height:1] cursor-pointer [color:var(--ink)]" aria-label="Close" onClick={() => setSheet(null)}>×</button>
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

      <nav className="fixed [bottom:0] [left:50%] [transform:translateX(-50%)] [width:100%] [max-width:480px] [z-index:30] grid [grid-template-columns:repeat(4,_1fr)] [padding:8px_8px_calc(8px_+_env(safe-area-inset-bottom))] [background:#fff] [border-top:1px_solid_var(--line)] [box-shadow:0_-6px_20px_rgba(53,_37,_31,_.08)] [&_button]:grid [&_button]:[justify-items:center] [&_button]:[gap:3px] [&_button]:[padding:6px_4px] [&_button]:border-0 [&_button]:bg-transparent [&_button]:[font:inherit] [&]:[&_button]:[font-size:.72rem] [&]:[&_button]:font-bold [&_button]:[color:var(--muted)] [&_button]:cursor-pointer [&_button]:[border-radius:12px] [&_button[aria-current=page]]:[color:var(--espresso)] [@media(max-height:480px)_and_(orientation:landscape)]:[padding-top:4px] [@media(max-height:480px)_and_(orientation:landscape)]:[padding-bottom:calc(4px_+_env(safe-area-inset-bottom))] rider-nav" aria-label="Rider app">
        {([['jobs', 'Deliveries', 'bike'], ['earnings', 'Earnings', 'wallet'], ['history', 'History', 'clock'], ['profile', 'Profile', 'user']] as const).map(([k, label, icon]) => (
          <button key={k} type="button" aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>
            <span className="[.rider-nav_button[aria-current=page]_&]:[background:var(--sage-tint)] [.rider-nav_button[aria-current=page]_&]:[color:var(--sage-dark)] relative grid place-items-center [width:52px] [height:30px] rounded-full">
              <Icon name={icon} size={22} />
              {k === 'jobs' && (data?.assignments.length ?? 0) > 0 && <span className="absolute [top:-4px] [right:2px] [min-width:18px] [height:18px] [padding:0_5px] grid place-items-center rounded-full [background:var(--danger)] [color:#fff] [font-size:.66rem]">{data!.assignments.length}</span>}
            </span>
            {label}
          </button>
        ))}
      </nav>
      {toast && (
        <div className={`fixed [left:50%] [bottom:18px] [transform:translateX(-50%)] [background:#fff] [color:#111] [padding:12px_18px] [border-radius:12px] font-bold [box-shadow:var(--shadow-2)] [z-index:60] [max-width:calc(100vw_-_32px)] [&.error]:[background:#ffdcd8] [&.error]:[color:#6a1610] [.rider-app_&]:[bottom:calc(96px_+_env(safe-area-inset-bottom))] ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
