'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLive, postJson } from '@/lib/use-live';
import { formatLocalTime } from '@/lib/time';
import { Icon } from '../Icon';
import { BrandMark } from '../BrandMark';
import { LogoutButton } from '../LoginForm';
import type { KitchenQueue } from '@/server/orders/queries';

type Ticket = KitchenQueue['orders'][number];

function mins(fromIso: string | Date | null, now: number) {
  if (!fromIso) return null;
  return Math.floor((now - new Date(fromIso).getTime()) / 60000);
}

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
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
    setTimeout(() => ctx.close(), 800);
  } catch {
    /* audio unavailable — visual alerts still shown */
  }
}

export function KitchenDisplay({ timezone, userName, canMarkSoldOut, readOnly = false }: { timezone: string; userName: string; canMarkSoldOut: boolean; readOnly?: boolean }) {
  const { data, status, error, lastSuccess, refresh } = useLive<KitchenQueue>({ url: '/api/kitchen/queue', topics: ['kitchen'], pollMs: 10000 });
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [lateOnly, setLateOnly] = useState(false);
  const [issueFor, setIssueFor] = useState<Ticket | null>(null);
  const [issueText, setIssueText] = useState('');
  const [soldOutOpen, setSoldOutOpen] = useState(false);
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

  async function act(t: Ticket, action: 'accept' | 'start' | 'ready' | 'recall' | 'collected') {
    setBusy(t.id + action);
    try {
      await postJson(`/api/kitchen/orders/${t.id}`, { action });
      const labels = { accept: 'Accepted', start: 'Started', ready: 'Marked ready', recall: 'Recalled to preparing', collected: 'Handed to customer' };
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
  const filter = (o: Ticket) => !lateOnly || isLate(o);
  const cols = useMemo(
    () => [
      { key: 'new', title: 'New', list: orders.filter((o) => (o.kitchenStatus === 'new' || o.kitchenStatus === 'accepted') && filter(o)) },
      { key: 'preparing', title: 'Preparing', list: orders.filter((o) => o.kitchenStatus === 'preparing' && filter(o)) },
      { key: 'ready', title: 'Ready / handoff', list: orders.filter((o) => o.kitchenStatus === 'ready' && filter(o)) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, lateOnly, now],
  );
  const staleMs = lastSuccess ? now - lastSuccess : Infinity;
  const connClass = error && staleMs > 30000 ? 'down' : status === 'live' && staleMs < 45000 ? '' : 'stale';
  const connText = connClass === 'down' ? 'Offline — orders may be missing' : connClass === 'stale' ? `Reconnecting (data ${lastSuccess ? `${Math.round(staleMs / 1000)}s old` : 'not loaded'})` : 'Live';

  return (
    <div className="kds">
      <div className="kds-top">
        <span className="brand">
          <BrandMark /> Kitchen
        </span>
        <span className={`conn ${connClass}`} role="status" aria-live="polite">
          <span className="dot" aria-hidden="true" /> {connText}
        </span>
        {lateCount > 0 && (
          <button className="btn danger sm" aria-pressed={lateOnly} onClick={() => setLateOnly((x) => !x)}>
            <Icon name="alert" size={16} /> {lateCount} late{lateOnly ? ' (showing only late)' : ''}
          </button>
        )}
        <span className="grow" />
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
          <button className="btn sm" onClick={() => setSound((s) => !s)} aria-pressed={sound} title="New-order sound">
            <Icon name={sound ? 'volume' : 'mute'} size={18} /> {sound ? 'Sound on' : 'Sound off'}
          </button>
        )}
        <button className="btn sm" onClick={() => void refresh()}>
          <Icon name="refresh" size={16} /> Refresh
        </button>
        {!readOnly && (
          <>
            <span className="small" style={{ color: 'var(--muted)' }}>
              {userName}
            </span>
            <LogoutButton to="/kitchen/login" />
          </>
        )}
      </div>

      {!readOnly && !sound && <p style={{ margin: 0, padding: '6px 16px', background: 'var(--caramel-tint)', color: 'var(--espresso)', fontWeight: 700, fontSize: '0.9rem' }}>Tap “Sound off” to turn on the new-order chime. New orders also flash and show a banner.</p>}

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
      {error && !data && <p className="alert error" style={{ margin: 16 }}>{error}</p>}

      <div className="kds-cols">
        {cols.map((c) => (
          <section key={c.key} className="kds-col" aria-labelledby={`col-${c.key}`}>
            <h2 id={`col-${c.key}`}>
              {c.title} <span className="count">{c.list.length}</span>
            </h2>
            {c.list.length === 0 && <p style={{ color: 'var(--muted)' }}>{c.key === 'new' ? 'No new orders.' : 'Nothing here.'}</p>}
            {c.list.map((t) => {
              const late = isLate(t);
              const waiting = mins(t.placedAt, now);
              const prep = mins(t.prepStartedAt, now);
              const dueIn = Math.round((new Date(t.promisedAt).getTime() - now) / 60000);
              const allergens = [...new Set(t.items.flatMap((i) => i.allergens))];
              return (
                <article key={t.id} className={`kt ${t.kitchenStatus === 'preparing' ? 'preparing' : t.kitchenStatus === 'ready' ? 'ready' : 'new'} ${late ? 'late' : ''} ${fresh.has(t.id) ? 'new-flash' : ''}`} aria-label={`Order ${t.orderNumber}${late ? ', late' : ''}`}>
                  <div className="kt-head">
                    <div>
                      <div className="kt-num">{t.orderNumber.replace('BS-', '')}</div>
                      <div className="small">{t.customerFirstName}</div>
                    </div>
                    <div className="kt-meta">
                      <span className={`kt-flag ${t.fulfillmentType === 'delivery' ? 'delivery' : ''}`}>{t.fulfillmentType === 'delivery' ? 'DELIVERY' : 'PICKUP'}</span>{' '}
                      {late && <span className="kt-flag late">LATE</span>}
                      <div>
                        Due {formatLocalTime(t.promisedAt, timezone)}
                        {t.isAsap ? '' : ' (scheduled)'}
                      </div>
                      {t.kitchenStatus === 'accepted' && <div>Accepted</div>}
                    </div>
                  </div>
                  <ul className="kt-items">
                    {t.items.map((it) => (
                      <li key={it.id}>
                        <span className="kt-qty">{it.quantity}×</span>
                        <span className="kt-item">{it.itemName}</span>
                        {it.variantName && <span className="kt-item"> ({it.variantName})</span>}
                        {it.modifiers.length > 0 && <div className="kt-mods">{it.modifiers.map((m) => m.name).join(' · ')}</div>}
                        {it.instructions && <div className="kt-note">“{it.instructions}”</div>}
                      </li>
                    ))}
                  </ul>
                  {t.customerNotes && <div className="kt-note" style={{ margin: '0 14px 10px' }}>Order note: “{t.customerNotes}”</div>}
                  {allergens.length > 0 && <div className="kt-allergen" style={{ margin: '0 14px 10px' }}>Contains: {allergens.join(', ')}</div>}
                  <div className="kt-timer">
                    <span>{t.kitchenStatus === 'preparing' ? `Cooking ${prep ?? 0} min` : t.kitchenStatus === 'ready' ? `Ready ${mins(t.readyAt, now) ?? 0} min` : `Waiting ${waiting ?? 0} min`}</span>
                    <span style={{ color: late ? 'var(--status-urgent)' : undefined, fontWeight: late ? 800 : undefined }}>{t.kitchenStatus === 'ready' ? (t.fulfillmentType === 'delivery' ? (t.riderAssigned ? 'Rider assigned' : 'No rider yet') : 'Awaiting customer') : dueIn >= 0 ? `Due in ${dueIn} min` : `${-dueIn} min overdue`}</span>
                  </div>
                  {!readOnly && (
                    <div className="kt-actions">
                      {t.kitchenStatus === 'new' && (
                        <button className="btn" disabled={!!busy} onClick={() => act(t, 'accept')}>
                          Accept
                        </button>
                      )}
                      {(t.kitchenStatus === 'new' || t.kitchenStatus === 'accepted') && (
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
                        <button className="btn" disabled={!!busy} onClick={() => act(t, 'recall')}>
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
                      >
                        <Icon name="alert" />
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        ))}
      </div>

      <dialog ref={dialog} className="sheet" onClose={() => setIssueFor(null)}>
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
        <div className={`kds-toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
