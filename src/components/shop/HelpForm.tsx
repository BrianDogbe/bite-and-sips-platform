'use client';
import { useState } from 'react';
import { postJson } from '@/lib/use-live';

const CATS: [string, string][] = [
  ['missing_order', 'My order hasn’t arrived'],
  ['incorrect_items', 'Something was wrong or missing'],
  ['payment', 'Payment problem'],
  ['delivery_delay', 'Delivery is late'],
  ['wrong_address', 'Wrong address'],
  ['failed_handoff', 'Couldn’t receive the order'],
  ['cancellation_refund', 'Cancellation or refund'],
  ['other', 'Something else'],
];

export function HelpForm({ trackingToken, prefill, openNow }: { trackingToken: string | null; prefill: { orderNumber: string; name: string; phone: string } | null; openNow: boolean }) {
  const [f, setF] = useState({ orderNumber: prefill?.orderNumber ?? '', name: prefill?.name ?? '', phone: prefill?.phone ?? '', email: '', category: 'missing_order', message: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  if (done)
    return (
      <div className="alert ok" role="status">
        Thanks, we’ve received your message. Your case number is <strong>{done}</strong>. Someone from the team will call you on <strong className="tnum">{f.phone}</strong> {openNow ? 'as soon as we can today' : 'when we next open'}.
      </div>
    );
  return (
    <form
      className="panel stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const r = await postJson<{ caseNumber: string }>('/api/support', { ...f, trackingToken, email: f.email || null, phone: f.phone || null, orderNumber: f.orderNumber || null });
          setDone(r.caseNumber);
        } catch (ex) {
          setErr((ex as Error).message);
          setBusy(false);
        }
      }}
    >
      {trackingToken ? <p className="alert info small">This report will be linked to the order you were viewing.</p> : (
        <div className="field">
          <label htmlFor="h-on">Order number (if you have one)</label>
          <input id="h-on" className="input" value={f.orderNumber} onChange={(e) => setF({ ...f, orderNumber: e.target.value.toUpperCase() })} maxLength={12} />
        </div>
      )}
      <div className="field">
        <label htmlFor="h-cat">What’s the problem?</label>
        <select id="h-cat" className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          {CATS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="h-msg">Details</label>
        <textarea id="h-msg" className="textarea" required minLength={5} maxLength={2000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="h-name">Your name</label>
          <input id="h-name" className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="h-phone">Phone</label>
          <input id="h-phone" className="input" type="tel" required autoComplete="tel" aria-describedby="h-phone-hint" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={16} />
        </div>
      </div>
      <p className="hint m-0" id="h-phone-hint">We reply by phone call{openNow ? '' : ' once we’re open'}.</p>
      <div className="field">
        <label htmlFor="h-email">Email (optional)</label>
        <input id="h-email" className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={120} />
      </div>
      {err && <p className="alert error" role="alert">{err}</p>}
      <button className="btn primary lg" disabled={busy}>
        {busy ? 'Sending…' : 'Send to the team'}
      </button>
    </form>
  );
}
