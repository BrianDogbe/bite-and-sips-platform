'use client';
import { useState } from 'react';
import { postJson } from '@/lib/use-live';

export function RegisterForm() {
  const [f, setF] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await postJson('/api/auth/register', f);
          window.location.assign('/account');
        } catch (ex) {
          setErr((ex as Error).message);
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="r-n">Name</label>
        <input id="r-n" className="input" autoComplete="name" required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor="r-e">Email</label>
        <input id="r-e" className="input" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={120} />
      </div>
      <div className="field">
        <label htmlFor="r-p">Phone</label>
        <input id="r-p" className="input" type="tel" autoComplete="tel" required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="024 123 4567" maxLength={16} />
      </div>
      <div className="field">
        <label htmlFor="r-pw">Password</label>
        <input id="r-pw" className="input" type="password" autoComplete="new-password" required minLength={10} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} maxLength={200} />
        <span className="hint">At least 10 characters.</span>
      </div>
      {err && <p className="alert error" role="alert">{err}</p>}
      <button className="btn primary lg block" disabled={busy}>
        {busy ? 'Creating your account…' : 'Create account'}
      </button>
    </form>
  );
}
