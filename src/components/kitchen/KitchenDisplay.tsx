'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useLive, postJson } from '@/lib/use-live';
import { formatLocalTime } from '@/lib/time';
import { Icon } from '../Icon';
import { BrandMark } from '../BrandMark';
import { LogoutButton } from '../LoginForm';
import { DIALOG } from '../ui';
import type { KitchenQueue } from '@/server/orders/queries';
import { C_BAR_CARET, C_BAR_DROPDOWN, C_BAR_DROPDOWN_OUT, C_BRAND, C_SIDE_AVATAR } from '@/components/ui';

type Ticket = KitchenQueue['orders'][number];

function mins(fromIso: string | Date | null, now: number) {
  if (!fromIso) return null;
  return Math.floor((now - new Date(fromIso).getTime()) / 60000);
}

const SOUND_KEY = 'bs-kds-sound';
const REMIND_MS = 30000;
// One-tap decline reasons. The customer sees the text on their tracking page, so it's written to them.
const DECLINE_REASONS: { text: string; deliveryOnly?: boolean }[] = [
  { text: 'Something in your order is sold out' },
  { text: 'The kitchen is too busy right now' },
  { text: 'We’re closing soon' },
  { text: 'We can’t deliver to this address', deliveryOnly: true },
];

// One shared audio context. Browsers keep it suspended until someone taps the page, so callers check `state`.
let audioCtx: AudioContext | null = null;
function getAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctx();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function beep() {
  const ctx = getAudio();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.55);
  } catch {
    /* audio unavailable — visual alerts still shown */
  }
}

export function KitchenDisplay({ timezone, userName, roleLabel, canMarkSoldOut, readOnly = false }: { timezone: string; userName: string; roleLabel?: string; canMarkSoldOut: boolean; readOnly?: boolean }) {
  const [userMenu, setUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!userMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!userMenuRef.current?.contains(e.target as Node)) setUserMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUserMenu(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [userMenu]);
  const { data, status, error, signedOut, lastSuccess, refresh } = useLive<KitchenQueue>({ url: '/api/kitchen/queue', topics: ['kitchen'], pollMs: 10000 });
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(false);
  const [audioOk, setAudioOk] = useState(true);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [lateOnly, setLateOnly] = useState(false);
  // Below 900px the three columns become tabs; this is the one showing.
  const [activeCol, setActiveCol] = useState('new');
  const [issueFor, setIssueFor] = useState<Ticket | null>(null);
  // Ticket ids with the decline-reason or recall-confirm step open (shown inside the ticket, no browser pop-up).
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [declineOther, setDeclineOther] = useState('');
  const [recallFor, setRecallFor] = useState<string | null>(null);
  const [issueText, setIssueText] = useState('');
  const [soldOutOpen, setSoldOutOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [menu, setMenu] = useState<{ id: number; name: string; orderable: boolean }[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.error ? 6000 : 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // Sound choice survives a reload; a stored "on" still needs one tap before the browser lets it play.
  useEffect(() => {
    if (readOnly) return;
    try {
      if (localStorage.getItem(SOUND_KEY) === '1') setSound(true);
    } catch {
      /* storage unavailable — sound starts off */
    }
  }, [readOnly]);
  useEffect(() => {
    if (!sound) return;
    const ctx = getAudio();
    if (!ctx) {
      setAudioOk(false);
      return;
    }
    const sync = () => setAudioOk(ctx.state === 'running');
    const unlock = () => {
      if (ctx.state !== 'running') void ctx.resume().catch(() => {});
    };
    sync();
    ctx.addEventListener('statechange', sync);
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      ctx.removeEventListener('statechange', sync);
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, [sound]);
  function toggleSound() {
    // On but blocked: this tap unlocks it rather than turning it off.
    const next = sound && audioOk ? false : true;
    setSound(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? '1' : '0');
    } catch {
      /* not remembered — still works for this session */
    }
    if (next) void getAudio()?.resume().then(beep).catch(() => {});
  }

  // New-order alerts (sound if enabled + visual flash). First load only seeds the set.
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.orders.filter((o) => o.kitchenStatus === 'new' || o.kitchenStatus === 'accepted').map((o) => o.id));
    if (seen.current) {
      const added = [...ids].filter((id) => !seen.current!.has(id));
      if (added.length) {
        if (sound) beep();
        setFresh((p) => new Set([...p, ...added]));
        const first = data.orders.find((o) => o.id === added[0]);
        setToast({ msg: `New order ${first?.orderNumber ?? ''}${added.length > 1 ? ` (+${added.length - 1} more)` : ''}` });
        setTimeout(() => setFresh((p) => new Set([...p].filter((x) => !added.includes(x)))), 6000);
      }
    }
    seen.current = new Set([...(seen.current ?? []), ...ids]);
  }, [data, sound]);

  async function act(t: Ticket, action: 'accept' | 'start' | 'ready' | 'recall' | 'collected' | 'decline' | 'assign', note?: string, riderId?: string) {
    setBusy(t.id + action);
    try {
      await postJson(`/api/kitchen/orders/${t.id}`, { action, ...(note ? { note } : {}), ...(riderId ? { riderId } : {}) });
      const labels = { assign: 'Rider assigned', decline: 'Declined', accept: 'Accepted', start: 'Started', ready: 'Marked ready', recall: 'Recalled to preparing', collected: 'Handed to customer' };
      setToast({ msg: `${t.orderNumber}: ${labels[action]}` });
    } catch (e) {
      setToast({ msg: `${t.orderNumber}: ${(e as Error).message}`, error: true });
    } finally {
      setBusy(null);
      void refresh();
    }
  }

  async function sendIssue() {
    if (!issueFor || !issueText.trim()) return;
    try {
      await postJson('/api/kitchen/exceptions', { orderId: issueFor.id, kind: 'kitchen_issue', message: issueText });
      setToast({ msg: `Manager alerted about ${issueFor.orderNumber}` });
      void refresh();
      setIssueFor(null);
      setIssueText('');
      dialog.current?.close();
    } catch (e) {
      setToast({ msg: (e as Error).message, error: true });
    }
  }

  async function setAvailability(id: number, available: boolean) {
    try {
      await postJson(`/api/kitchen/items/${id}`, { available, reason: available ? null : 'Sold out' });
      setToast({ msg: available ? 'Back on the menu' : 'Marked sold out — customers can no longer order it' });
      void refresh();
      if (soldOutOpen) void loadMenu();
    } catch (e) {
      setToast({ msg: (e as Error).message, error: true });
    }
  }
  async function loadMenu() {
    const r = await fetch('/api/menu', { cache: 'no-store' });
    const j = (await r.json()) as { items: { id: number; name: string; orderable: boolean }[] };
    setMenu(j.items);
  }

  const orders = data?.orders ?? [];
  const isLate = (o: Ticket) => ['new', 'accepted', 'preparing'].includes(o.kitchenStatus) && new Date(o.promisedAt).getTime() < now;
  const lateCount = orders.filter(isLate).length;
  const unaccepted = orders.filter((o) => o.kitchenStatus === 'new');
  const unacceptedCount = unaccepted.length;

  // Keep nagging until every new order is accepted: chime every 30s, count in the tab title.
  useEffect(() => {
    if (readOnly || !sound || !unacceptedCount) return;
    const t = setInterval(beep, REMIND_MS);
    return () => clearInterval(t);
  }, [readOnly, sound, unacceptedCount]);
  useEffect(() => {
    if (readOnly) return;
    const strip = () => document.title.replace(/^\(\d+\) /, '');
    document.title = unacceptedCount ? `(${unacceptedCount}) ${strip()}` : strip();
    return () => {
      document.title = strip();
    };
  }, [readOnly, unacceptedCount]);

  function showFirstUnaccepted() {
    setActiveCol('new'); // on a phone the New column may be behind another tab
    requestAnimationFrame(() => {
      const el = unaccepted[0] && document.getElementById(`kds-${unaccepted[0].id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus({ preventScroll: true });
    });
  }

  const filter = (o: Ticket) => !lateOnly || isLate(o);
  const cols = useMemo(
    () => [
      {
        key: 'new',
        title: 'New',
        // Waiting-to-accept first; sort is stable so arrival order holds inside each group.
        list: orders
          .filter((o) => (o.kitchenStatus === 'new' || o.kitchenStatus === 'accepted') && filter(o))
          .sort((a, b) => (a.kitchenStatus === 'new' ? 0 : 1) - (b.kitchenStatus === 'new' ? 0 : 1)),
      },
      { key: 'preparing', title: 'Preparing', list: orders.filter((o) => o.kitchenStatus === 'preparing' && filter(o)) },
      { key: 'ready', title: 'Ready / handoff', list: orders.filter((o) => o.kitchenStatus === 'ready' && filter(o)) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, lateOnly, now],
  );
  const staleMs = lastSuccess ? now - lastSuccess : Infinity;
  const connClass = signedOut || (error && staleMs > 30000) ? 'down' : status === 'live' && staleMs < 45000 ? '' : 'stale';
  const connText = signedOut ? 'Signed out — not receiving orders' : connClass === 'down' ? 'Offline — orders may be missing' : connClass === 'stale' ? `Reconnecting (data ${lastSuccess ? `${Math.round(staleMs / 1000)}s old` : 'not loaded'})` : 'Live';

  return (
    <div className="[--font-display:var(--font-body)] [background:var(--ivory)] [color:var(--charcoal)] [min-height:100dvh] [font-size:1.05rem] [&_h1]:font-extrabold [&_h1]:[letter-spacing:-0.01em] [&_h2]:font-extrabold [&_h2]:[letter-spacing:-0.01em] [&_h3]:font-extrabold [&_h3]:[letter-spacing:-0.01em] [.admin-main_&]:[min-height:0] [.admin-main_&]:bg-transparent [.admin-main_&]:[font-size:1rem]">
      <div className="flex items-center [gap:14px] [padding:10px_16px] [background:var(--white)] [border-bottom:1px_solid_var(--border)] sticky [top:0] [z-index:10] flex-wrap [.admin-main_&]:static [.admin-main_&]:[background:#fff] [.admin-main_&]:[border:1px_solid_var(--line)] [.admin-main_&]:[border-radius:16px] [.admin-main_&]:[padding:16px_22px] [.admin-main_&]:[margin-bottom:24px] [.admin-main_&]:[gap:14px] [.admin-main_&_.btn]:[min-height:40px] [.admin-main_&_.btn]:[padding-inline:16px] kds-top">
        <span className={C_BRAND}>
          <BrandMark /> Kitchen
        </span>
        <span className={`inline-flex items-center [gap:8px] font-bold [padding:6px_12px] rounded-full [background:var(--ok-bg)] [color:#10522f] [&_.dot]:[width:10px] [&_.dot]:[height:10px] [&_.dot]:rounded-[50%] [&_.dot]:[background:var(--status-ready)] [&.stale]:[background:var(--warn-bg)] [&.stale]:[color:#5e3a00] [&.stale_.dot]:[background:var(--status-prep)] [&.down]:[background:var(--danger-bg)] [&.down]:[color:#7a1a12] [&&.down_.dot]:[background:var(--status-urgent)] ${connClass}`} role="status" aria-live="polite">
          <span className="dot" aria-hidden="true" /> {connText}
        </span>
        {unacceptedCount > 0 && (
          <button className="btn sm [.kds-top_.btn&]:[background:var(--status-new)] [.kds-top_.btn&]:[border-color:var(--status-new)] [.kds-top_.btn&]:[color:#fff]" onClick={showFirstUnaccepted}>
            <Icon name="bell" size={16} /> {unacceptedCount} waiting to accept
          </button>
        )}
        {lateCount > 0 && (
          <button className="btn danger sm" aria-pressed={lateOnly} onClick={() => setLateOnly((x) => !x)}>
            <Icon name="alert" size={16} /> {lateCount} late{lateOnly ? ' (showing only late)' : ''}
          </button>
        )}
        <span className="grow" />
        <div className="flex items-center [gap:10px] flex-wrap">
        <button className={`btn sm${(data?.alerts.length ?? 0) > 0 ? ' [.kds-top_.btn&]:[border-color:#f2b8b2] [.kds-top_.btn&]:[background:var(--danger-bg)] [.kds-top_.btn&]:[color:#7a1a12]' : ''}`} aria-expanded={alertsOpen} onClick={() => setAlertsOpen((x) => !x)}>
          <Icon name="alert" size={16} /> Reported problems ({data?.alerts.length ?? 0})
        </button>
        {!readOnly && canMarkSoldOut && (
          <button
            className="btn sm"
            onClick={() => {
              setSoldOutOpen((x) => !x);
              void loadMenu();
            }}
          >
            Sold-out items ({data?.unavailable.length ?? 0})
          </button>
        )}
        {!readOnly && (
          <button className={`btn sm${sound && audioOk ? '' : ' [.kds-top_.btn&]:[background:var(--warn-bg)] [.kds-top_.btn&]:[border-color:#f0d18f] [.kds-top_.btn&]:[color:#5e3a00]'}`} onClick={toggleSound} aria-pressed={sound && audioOk} title="New-order sound">
            <Icon name={sound && audioOk ? 'volume' : 'mute'} size={18} /> {!sound ? 'Sound off — tap to turn on' : audioOk ? 'Sound on' : 'Sound blocked — tap to allow'}
          </button>
        )}
        <button className="btn sm" onClick={() => void refresh()}>
          <Icon name="refresh" size={16} /> Refresh
        </button>
        {!readOnly && (
          <div className="relative [margin-left:auto] [.bar-bell-wrap_+_&]:[margin-left:0] [.bar-right_&]:[margin-left:0] [.bar-right_&]:[padding-left:18px] [.bar-right_&]:[border-left:1px_solid_var(--line)] [.kds-top_&.kds-user]:block [.kds-top_&.kds-user]:[margin-left:6px] [.kds-top_&.kds-user]:[padding-left:18px] [.kds-top_&.kds-user]:[border-left:1px_solid_var(--line)] bar-menu inline-flex items-center [gap:12px] [.admin-main_&]:hidden kds-user" ref={userMenuRef}>
            <button type="button" className="flex items-center [gap:12px] no-underline [color:var(--ink)] [margin-left:auto] [.admin-bar_&_+_*]:[margin-left:0] [.bar-menu_&]:[margin-left:0] [.bar-menu_&]:bg-transparent [.bar-menu_&]:border-0 [.bar-menu_&]:[padding:4px_8px_4px_4px] [.bar-menu_&]:rounded-full [.bar-menu_&]:cursor-pointer [.bar-menu_&]:[font:inherit] [.bar-menu_&]:text-left [.bar-menu_&:hover]:[background:#fff] [.bar-menu_&[aria-expanded=true]]:[background:#fff] bar-user" aria-haspopup="menu" aria-expanded={userMenu} onClick={() => setUserMenu((m) => !m)}>
              <span className={C_SIDE_AVATAR} aria-hidden="true">{userName.trim().charAt(0).toUpperCase()}</span>
              <span className="grid [line-height:1.25] [font-size:0.82rem] [color:var(--muted)] [&_strong]:[color:var(--espresso)] [&_strong]:[font-size:0.92rem] max-[960px]:hidden">
                <strong>{userName}</strong>
                {roleLabel && <span>{roleLabel}</span>}
              </span>
              <svg className={C_BAR_CARET} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {userMenu && (
              <div className={`${C_BAR_DROPDOWN} bar-dropdown`} role="menu">
                <LogoutButton to="/kitchen/login" className={C_BAR_DROPDOWN_OUT} />
              </div>
            )}
          </div>
        )}
        </div>
      </div>


      {alertsOpen && (
        <section className="[padding:22px] [background:#fff] [border:1px_solid_var(--line)] [&]:[border-top:4px_solid_var(--danger)] [border-radius:16px] grid [gap:16px] [margin:14px] [&_h2]:m-0 [&_h2]:flex [&_h2]:justify-between [&_h2]:items-center [&_h2]:[font-size:1.1rem] [&_h2]:[color:var(--espresso)] [&_h2_.count]:[background:var(--danger)] [&_h2_.count]:[color:#fff] [&_h2_.count]:rounded-full [&_h2_.count]:[padding:2px_10px] [&_h2_.count]:[font-size:0.9rem] [.admin-main_&]:[margin:0_0_24px] kds-alerts" aria-labelledby="kds-alerts-h">
          <div className="row between">
            <h2 id="kds-alerts-h">
              Reported problems <span className="count">{data?.alerts.length ?? 0}</span>
            </h2>
            <button className="btn sm" onClick={() => setAlertsOpen(false)}>
              Close
            </button>
          </div>
          {!data || data.alerts.length === 0 ? (
            <p className="grid place-items-center [min-height:140px] m-0 [border:1.5px_dashed_var(--line-strong,_var(--border))] [border-radius:12px] [color:var(--muted)] font-semibold text-center [.admin-main_&]:[min-height:180px] [.kds-alerts_&&]:[min-height:90px] [.kds-alerts_&]:[gap:6px] [.kds-alerts_&]:[padding:16px]">No problems reported. Use the <Icon name="alert" size={16} /> button on a ticket to alert a manager.</p>
          ) : (
            <ul className="list-none m-0 p-0 grid [gap:12px] [&_li]:grid [&_li]:[grid-template-columns:auto_1fr_auto] [&_li]:[gap:14px] [&_li]:items-center [&_li]:[padding:16px_18px] [&_li]:[border-radius:12px] [&_li]:[background:var(--danger-bg)] [&_li]:[border:1px_solid_#f2b8b2] max-[700px]:[&_li]:[grid-template-columns:auto_1fr]">
              {data.alerts.map((a) => (
                <li key={a.id}>
                  <span className="[width:38px] [height:38px] [border-radius:10px] grid place-items-center [background:#fff] [color:var(--danger)]" aria-hidden="true"><Icon name="alert" size={18} /></span>
                  <div className="grid [gap:2px] [min-width:0] [overflow-wrap:anywhere]">
                    <strong>{a.orderNumber ?? 'General'}</strong>
                    <span>{a.message}</span>
                    <span className="small muted">
                      {a.raisedByName ?? 'Kitchen'} · {formatLocalTime(a.raisedAt, timezone)}
                    </span>
                  </div>
                  <span className="[font-size:0.8rem] font-bold [color:var(--danger)] whitespace-nowrap max-[700px]:[grid-column:2]">Waiting for a manager</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {soldOutOpen && (
        <div style={{ background: 'var(--white)', color: 'var(--charcoal)', border: '1px solid var(--border)', margin: 14, borderRadius: 12, padding: 14 }}>
          <div className="row between">
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Menu availability</h2>
            <button className="btn sm" onClick={() => setSoldOutOpen(false)}>
              Close
            </button>
          </div>
          <div className="grid-2" style={{ marginTop: 10 }}>
            {menu.map((m) => (
              <div key={m.id} className="row between" style={{ borderBottom: '1px solid #ddd', padding: '6px 0' }}>
                <span>{m.name}</span>
                {m.orderable ? (
                  <button className="btn sm danger" onClick={() => setAvailability(m.id, false)}>
                    Mark sold out
                  </button>
                ) : (
                  <button className="btn sm leaf" onClick={() => setAvailability(m.id, true)}>
                    Back in stock
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!data && !error && (
        <p style={{ padding: 20 }}>
          <span className="spinner" /> Loading orders…
        </p>
      )}
      {signedOut && (
        <section role="alert" className="flex items-center justify-between flex-wrap [gap:12px_20px] [margin:14px] [padding:18px_20px] [background:var(--danger-bg)] [border:2px_solid_var(--danger)] [border-radius:16px] [color:#7a1a12] [.admin-main_&]:[margin:0_0_24px]">
          <div className="grid [gap:4px]">
            <strong className="[font-size:1.3rem]">You’ve been signed out</strong>
            <span>New orders won’t appear on this screen until someone signs in again.</span>
          </div>
          <a className="btn primary [min-height:56px] [font-size:1.1rem]" href={readOnly ? '/admin/login' : '/kitchen/login'}>
            Sign in again
          </a>
        </section>
      )}
      {error && !data && !signedOut && <p className="alert error" style={{ margin: 16 }}>{error}</p>}

      <div className="flex [gap:8px] [padding:14px_14px_0] min-[900px]:hidden [.admin-main_&]:[padding:0_0_14px]" role="group" aria-label="Order columns">
        {cols.map((c) => {
          const toAccept = c.key === 'new' ? c.list.filter((o) => o.kitchenStatus === 'new').length : 0;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={activeCol === c.key}
              onClick={() => setActiveCol(c.key)}
              className="flex-1 grid place-items-center [gap:2px] [min-height:56px] [padding:6px_8px] [border-radius:12px] [border:1.5px_solid_var(--line-strong)] [background:var(--white)] [color:var(--espresso)] [font:inherit] [&]:font-extrabold [font-size:1rem] cursor-pointer aria-pressed:[background:var(--espresso)] aria-pressed:[border-color:var(--espresso)] aria-pressed:[color:#fff]"
            >
              <span>
                {c.title.split(' /')[0]} <span className="tabular-nums">{c.list.length}</span>
              </span>
              {toAccept > 0 && <span className="[font-size:0.8rem] [padding:1px_8px] rounded-full [background:var(--status-new)] [color:#fff]">{toAccept} to accept</span>}
            </button>
          );
        })}
      </div>

      <div className="grid [gap:14px] [padding:14px] [align-items:start] [grid-template-columns:repeat(3,_minmax(0,_1fr))] max-[899px]:[grid-template-columns:1fr] [.admin-main_&]:[min-height:420px] [.admin-main_&]:p-0 [.admin-main_&]:[gap:24px] max-[1000px]:[.admin-main_&]:[grid-template-columns:1fr]">
        {cols.map((c) => (
          <section key={c.key} className={`${activeCol === c.key ? '' : 'max-[899px]:hidden'}[&_h2]:[font-size:1.15rem] [&_h2]:[color:var(--espresso)] [&_h2]:flex [&_h2]:justify-between [&_h2]:[margin-bottom:10px] [&_.count]:[background:var(--espresso)] [&_.count]:[color:#fff] [&_.count]:rounded-full [&_.count]:[padding:0_10px] [.admin-main_&]:[min-height:300px] [.admin-main_&]:[background:#fff] [.admin-main_&]:[border:1px_solid_var(--line)] [&]:[.admin-main_&]:[border-top:4px_solid_var(--line-strong)] [.admin-main_&]:[border-radius:16px] [.admin-main_&]:[padding:22px] [.admin-main_&]:grid [.admin-main_&]:[gap:16px] [.admin-main_&]:[align-content:start] [.admin-main_&_h2]:items-center [.admin-main_&_h2]:[border-bottom:1px_solid_var(--line,_var(--border))] [.admin-main_&_h2]:m-0 [.admin-main_&_h2]:[padding-bottom:14px] [.admin-main_&_h2]:[font-size:1.1rem] [.admin-main_&_h2]:font-extrabold max-[1000px]:[.admin-main_&]:[min-height:0] [.admin-main_&:nth-child(1)]:[border-top-color:var(--status-new)] [.admin-main_&:nth-child(2)]:[border-top-color:var(--status-prep)] [.admin-main_&:nth-child(3)]:[border-top-color:var(--status-ready)] [.admin-main_&_.count]:[min-width:30px] [.admin-main_&_.count]:text-center [.admin-main_&_.count]:[padding:2px_10px] [.admin-main_&_.count]:[font-size:0.9rem]`} aria-labelledby={`col-${c.key}`}>
            <h2 id={`col-${c.key}`}>
              {c.title} <span className="count">{c.list.length}</span>
            </h2>
            {c.list.length === 0 && <p className="grid place-items-center [min-height:140px] m-0 [border:1.5px_dashed_var(--line-strong,_var(--border))] [border-radius:12px] [color:var(--muted)] font-semibold text-center [.admin-main_&]:[min-height:180px] [.kds-alerts_&&]:[min-height:90px] [.kds-alerts_&]:[gap:6px] [.kds-alerts_&]:[padding:16px]">{c.key === 'new' ? 'No new orders.' : 'Nothing here.'}</p>}
            {c.list.map((t, i) => {
              const late = isLate(t);
              // Only while the order is still in the state the step applies to (it may change under the cook's hands).
              const declining = declineFor === t.id && t.kitchenStatus === 'new';
              const recalling = recallFor === t.id && t.kitchenStatus === 'ready';
              const waitingAccept = t.kitchenStatus === 'new';
              const groupStart = c.key === 'new' && t.kitchenStatus !== c.list[i - 1]?.kitchenStatus;
              const groupSize = c.list.filter((o) => o.kitchenStatus === t.kitchenStatus).length;
              const waiting = mins(t.placedAt, now);
              const prep = mins(t.prepStartedAt, now);
              const dueIn = Math.round((new Date(t.promisedAt).getTime() - now) / 60000);
              const allergens = [...new Set(t.items.flatMap((i) => i.allergens))];
              return (
                <Fragment key={t.id}>
                {groupStart && (
                  <h3 className={`flex justify-between items-center [margin:4px_2px_8px] [font-size:1rem] [color:var(--espresso)]${i > 0 ? ' [margin-top:20px]' : ''}`}>
                    {waitingAccept ? 'Waiting to accept' : 'Accepted — not started'} <span className="tabular-nums">{groupSize}</span>
                  </h3>
                )}
                <article id={`kds-${t.id}`} tabIndex={-1} className={`[background:var(--white)] [&.waiting]:[background:var(--info-bg)] [&.waiting:not(.late)]:[outline:3px_solid_var(--status-new)] focus-visible:[outline:3px_solid_var(--espresso)] [color:var(--charcoal)] [border:1px_solid_var(--border)] [border-radius:var(--r-md)] [margin-bottom:12px] overflow-hidden [&]:[border-top:8px_solid_#9a9288] [&.new]:[border-top-color:var(--status-new)] [&.preparing]:[border-top-color:var(--status-prep)] [&.ready]:[border-top-color:var(--status-ready)] [&.late]:[border-top-color:var(--status-urgent)] [&.late]:[outline:3px_solid_var(--status-urgent)] ${t.kitchenStatus === 'preparing' ? 'preparing' : t.kitchenStatus === 'ready' ? 'ready' : 'new'} ${late ? 'late' : ''} ${waitingAccept ? 'waiting' : ''} ${fresh.has(t.id) ? '[animation:flash_1.2s_ease-out_2]' : ''}`} aria-label={`Order ${t.orderNumber}${waitingAccept ? ', waiting to accept' : ''}${late ? ', late' : ''}`}>
                  <div className="grid [gap:8px] [padding:12px_14px_8px]">
                    {/* Readable from across the kitchen: number left, the clock that matters right. */}
                    <div className="flex justify-between items-start [gap:10px]">
                      <div className="[font-family:var(--font-body)] font-extrabold [font-size:2.5rem] [letter-spacing:-0.02em] [line-height:1] tabular-nums">{t.orderNumber.replace('BS-', '')}</div>
                      <div className="text-right [line-height:1.2]">
                        <div className={`font-extrabold [font-size:1.3rem] tabular-nums ${late ? '[color:var(--status-urgent)]' : '[color:var(--espresso)]'}`}>
                          {t.kitchenStatus === 'ready' ? `Ready ${mins(t.readyAt, now) ?? 0} min` : dueIn >= 0 ? `Due in ${dueIn} min` : `${-dueIn} min overdue`}
                        </div>
                        <div className="[font-size:1rem] [color:#5a4d41]">
                          Due {formatLocalTime(t.promisedAt, timezone)}
                          {t.isAsap ? '' : ' (scheduled)'}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center [gap:6px]">
                      <span className="[font-size:1.1rem] font-bold [margin-right:4px] [min-width:0] [overflow-wrap:anywhere]">{t.customerFirstName}</span>
                      <span className={`inline-block font-extrabold [font-size:0.85rem] [padding:2px_8px] [border-radius:6px] [background:#efe6d8] [&.delivery]:[background:var(--info-bg)] [&.delivery]:[color:#1b4db5] [&.late]:[background:var(--status-urgent)] [&.late]:[color:#fff] ${t.fulfillmentType === 'delivery' ? 'delivery' : ''}`}>{t.fulfillmentType === 'delivery' ? 'DELIVERY' : 'PICKUP'}</span>{' '}
                      {waitingAccept && <span className="inline-block font-extrabold [font-size:0.85rem] [padding:2px_8px] [border-radius:6px] [background:var(--status-new)] [color:#fff]">NOT ACCEPTED</span>}{' '}
                      {late && <span className="inline-block font-extrabold [font-size:0.85rem] [padding:2px_8px] [border-radius:6px] [background:#efe6d8] [&.delivery]:[background:var(--info-bg)] [&.delivery]:[color:#1b4db5] [&.late]:[background:var(--status-urgent)] [&.late]:[color:#fff] late">LATE</span>}
                    </div>
                  </div>
                  <ul className="list-none m-0 [padding:4px_14px_10px] [&_li]:[padding:8px_0] [&_li]:[border-bottom:1px_dashed_#d9ccb6] [&_li:last-child]:[border-bottom:0]">
                    {t.items.map((it) => (
                      <li key={it.id}>
                        <span className="font-extrabold [font-size:1.45rem] [margin-right:6px] tabular-nums">{it.quantity}×</span>
                        <span className="font-extrabold [font-size:1.35rem] [line-height:1.25]">{it.itemName}</span>
                        {it.variantName && <span className="font-extrabold [font-size:1.35rem] [line-height:1.25]"> ({it.variantName})</span>}
                        {it.modifiers.length > 0 && <div className="[font-size:1.1rem] [color:#3d3025] [margin-top:2px]">{it.modifiers.map((m) => m.name).join(' · ')}</div>}
                        {it.instructions && <div className="[background:var(--caramel-tint)] [border-left:5px_solid_var(--caramel)] [padding:6px_10px] [margin-top:6px] font-bold">“{it.instructions}”</div>}
                      </li>
                    ))}
                  </ul>
                  {t.customerNotes && <div className="[background:var(--caramel-tint)] [border-left:5px_solid_var(--caramel)] [padding:6px_10px] [margin-top:6px] font-bold" style={{ margin: '0 14px 10px' }}>Order note: “{t.customerNotes}”</div>}
                  {allergens.length > 0 && <div className="[background:#fde8e6] [border-left:5px_solid_var(--danger)] [padding:6px_10px] [margin-top:6px] font-extrabold [color:#7a1a12]" style={{ margin: '0 14px 10px' }}>Contains: {allergens.join(', ')}</div>}
                  <div className="[padding:8px_14px] [background:#f1eadb] font-bold [font-size:1.05rem] tabular-nums">
                    {t.kitchenStatus === 'preparing' ? `Cooking ${prep ?? 0} min` : t.kitchenStatus === 'ready' ? (t.fulfillmentType === 'delivery' ? (t.riderAssigned ? 'Rider assigned' : 'No rider yet') : 'Awaiting customer') : `Waiting ${waiting ?? 0} min`}
                  </div>
                  {!readOnly && data?.canAssign && t.fulfillmentType === 'delivery' && t.kitchenStatus === 'ready' && ['unassigned', 'assigned'].includes(t.fulfillmentStatus) && (
                    <div className="grid [gap:8px] [margin:12px_0_0] [padding:10px_12px] [background:var(--ivory-2)] [border:1px_solid_var(--line)] [border-radius:12px]">
                      <div className="flex items-center justify-between [gap:10px]">
                        <span className="inline-flex items-center [gap:6px] [font-size:.78rem] font-bold [letter-spacing:.06em] uppercase [color:var(--muted)]"><Icon name="bike" size={16} /> Rider</span>
                        <span className={`[font-size:.82rem] font-bold [padding:3px_10px] rounded-full [background:var(--caramel-tint)] [color:var(--caramel-text)] [&.set]:[background:var(--sage-tint)] [&.set]:[color:var(--sage-dark)]${t.riderName ? ' set' : ''}`}>{t.riderName ?? 'Not assigned'}</span>
                      </div>
                      <select id={`rd-${t.id}`} className="[width:100%] [height:48px] [padding:0_12px] [font:inherit] [&]:[font-size:1rem] [color:var(--ink)] [background:#fff] [border:1px_solid_var(--line-strong)] [border-radius:10px] cursor-pointer focus-visible:[outline:2px_solid_var(--sage-dark)] [&]:focus-visible:[outline-offset:1px]" aria-label={`Rider for order ${t.orderNumber}`} defaultValue="" disabled={!!busy} onChange={(e) => { const v = e.target.value; if (v) { void act(t, 'assign', undefined, v); e.target.value = ''; } }}>
                        <option value="">{t.riderName ? 'Change rider…' : 'Assign a rider now…'}</option>
                        {(data?.riders ?? []).filter((r) => r.online).map((r) => <option key={r.id} value={r.id}>{r.name}{r.active ? ` (${r.active} active)` : ''}</option>)}
                      </select>
                      {(data?.riders ?? []).every((r) => !r.online) && <span className="[font-size:.8rem] [color:var(--muted)]">No riders are online right now.</span>}
                    </div>
                  )}
                  {!readOnly && declining && (
                    <div className="grid [gap:8px] [padding:10px_14px_14px] [border-top:1px_solid_var(--line)]" role="group" aria-label={`Decline order ${t.orderNumber}`}>
                      <p className="m-0 font-bold">Decline {t.orderNumber}? The customer will see the reason.</p>
                      <div className="grid [grid-template-columns:repeat(2,_minmax(0,_1fr))] [gap:8px] max-[520px]:[grid-template-columns:1fr] [&_.btn]:[min-height:56px] [&_.btn]:whitespace-normal">
                        {DECLINE_REASONS.filter((r) => !r.deliveryOnly || t.fulfillmentType === 'delivery').map((r) => (
                          <button key={r.text} className="btn" disabled={!!busy} onClick={() => { setDeclineFor(null); void act(t, 'decline', r.text); }}>
                            {r.text}
                          </button>
                        ))}
                      </div>
                      <form
                        className="flex [gap:8px] [&_.btn]:[min-height:56px]"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!declineOther.trim()) return;
                          setDeclineFor(null);
                          void act(t, 'decline', declineOther.trim());
                          setDeclineOther('');
                        }}
                      >
                        <input className="input [flex:1_1_auto] [min-height:56px]" aria-label="Other reason" placeholder="Other reason…" value={declineOther} onChange={(e) => setDeclineOther(e.target.value)} maxLength={200} />
                        <button className="btn danger" disabled={!!busy || !declineOther.trim()}>Decline</button>
                      </form>
                      <button className="btn primary [min-height:56px] [font-size:1.1rem]" onClick={() => { setDeclineFor(null); setDeclineOther(''); }}>
                        Keep order
                      </button>
                    </div>
                  )}
                  {!readOnly && recalling && (
                    <div className="grid [gap:8px] [padding:10px_14px_14px] [border-top:1px_solid_var(--line)]" role="group" aria-label={`Recall order ${t.orderNumber}`}>
                      <p className="m-0 font-bold">Send {t.orderNumber} back to preparing?</p>
                      <div className="flex [gap:8px] [&_.btn]:[flex:1_1_0] [&_.btn]:[min-height:56px] [&_.btn]:[font-size:1.1rem]">
                        <button className="btn" disabled={!!busy} onClick={() => { setRecallFor(null); void act(t, 'recall'); }}>
                          Yes, recall
                        </button>
                        <button className="btn primary" onClick={() => setRecallFor(null)}>
                          Keep it ready
                        </button>
                      </div>
                    </div>
                  )}
                  {!readOnly && !declining && !recalling && (
                    <div className="flex flex-wrap [gap:8px] [padding:10px_14px_14px] [&_.btn]:[flex:1_1_auto] [&_.btn]:[min-height:56px] [&_.btn]:[font-size:1.1rem]">
                      {t.kitchenStatus === 'new' && (
                        <button className="btn primary" disabled={!!busy} onClick={() => act(t, 'accept')}>
                          Accept
                        </button>
                      )}
                      {t.kitchenStatus === 'new' && (
                        <button className="btn ghost [flex:0_0_auto]! [font-size:1rem]! [color:var(--muted)]" disabled={!!busy} onClick={() => setDeclineFor(t.id)}>
                          Decline
                        </button>
                      )}
                      {t.kitchenStatus === 'accepted' && (
                        <button className="btn primary" disabled={!!busy} onClick={() => act(t, 'start')}>
                          Start cooking
                        </button>
                      )}
                      {t.kitchenStatus === 'preparing' && (
                        <button className="btn leaf" disabled={!!busy} onClick={() => act(t, 'ready')}>
                          <Icon name="check" /> Ready
                        </button>
                      )}
                      {t.kitchenStatus === 'ready' && t.fulfillmentType === 'pickup' && (
                        <button className="btn leaf" disabled={!!busy} onClick={() => act(t, 'collected')}>
                          Handed to customer
                        </button>
                      )}
                      {t.kitchenStatus === 'ready' && (
                        <button className="btn" disabled={!!busy} onClick={() => setRecallFor(t.id)}>
                          Recall
                        </button>
                      )}
                      <button
                        className="btn ghost"
                        onClick={() => {
                          setIssueFor(t);
                          dialog.current?.showModal();
                        }}
                        aria-label={`Report a problem with ${t.orderNumber}`}
                        title="Report a problem to a manager"
                      >
                        <Icon name="alert" />
                      </button>
                    </div>
                  )}
                </article>
                </Fragment>
              );
            })}
          </section>
        ))}
      </div>

      <dialog ref={dialog} className={DIALOG} onClose={() => setIssueFor(null)}>
        <div style={{ padding: 20 }} className="stack">
          <h2>Alert a manager about {issueFor?.orderNumber}</h2>
          <label className="label" htmlFor="issue-text">
            What’s wrong?
          </label>
          <textarea id="issue-text" className="textarea" value={issueText} onChange={(e) => setIssueText(e.target.value)} placeholder="e.g. out of tilapia, customer must choose another fish" maxLength={500} />
          <div className="row">
            <button className="btn primary" onClick={sendIssue} disabled={!issueText.trim()}>
              Send alert
            </button>
            <button className="btn" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
          </div>
        </div>
      </dialog>

      {toast && (
        <div className={`fixed [left:50%] [bottom:18px] [transform:translateX(-50%)] [background:#fff] [color:#111] [padding:12px_18px] [border-radius:12px] font-bold [box-shadow:var(--shadow-2)] [z-index:60] [max-width:calc(100vw_-_32px)] [&.error]:[background:#ffdcd8] [&.error]:[color:#6a1610] [.rider-app_&]:[bottom:calc(96px_+_env(safe-area-inset-bottom))] ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
