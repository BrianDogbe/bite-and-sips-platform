'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson } from '@/lib/use-live';

export function TrackLookup() {
  const router = useRouter();
  const [num, setNum] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="panel stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const r = await postJson<{ token: string }>('/api/orders/lookup', { orderNumber: num, phone });
          router.push(`/track/${r.token}`);
        } catch (ex) {
          setErr((ex as Error & { status?: number }).status === 404 ? 'We couldn’t find an order with that number and phone. Check both and try again.' : (ex as Error).message);
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="onum">Order number</label>
        <input id="onum" className="input" placeholder="BS-XXXXXX" value={num} onChange={(e) => setNum(e.target.value.toUpperCase())} required maxLength={12} autoCapitalize="characters" />
      </div>
      <div className="field">
        <label htmlFor="ophone">Phone number</label>
        <input id="ophone" className="input" type="tel" inputMode="tel" placeholder="024 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={16} />
      </div>
      {err && (
        <p className="alert error" role="alert">
          {err}
        </p>
      )}
      <button className="btn primary lg" disabled={busy}>
        {busy ? 'Finding your order…' : 'Find my order'}
      </button>
    </form>
  );
}
