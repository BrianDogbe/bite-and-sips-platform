'use client';
import { useState } from 'react';
import { postJson } from '@/lib/use-live';

export function LoginForm({ portal, next, idLabel = 'Email or phone' }: { portal: 'admin' | 'kitchen' | 'rider' | 'customer'; next: string; idLabel?: string }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
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
          await postJson('/api/auth/login', { identifier: id, password: pw, portal });
          try {
            sessionStorage.setItem(`bs-tab-${portal}`, '1');
          } catch {
            /* storage unavailable */
          }
          window.location.assign(next);
        } catch (ex) {
          setErr((ex as Error).message);
          setBusy(false);
        }
      }}
    >
      <div className="field">
        <label htmlFor="lg-id">{idLabel}</label>
        <input id="lg-id" className="input" autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} required maxLength={120} />
      </div>
      <div className="field">
        <label htmlFor="lg-pw">Password</label>
        <input id="lg-pw" className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required maxLength={200} />
      </div>
      {err && (
        <p className="alert error" role="alert">
          {err}
        </p>
      )}
      <button type="submit" className="btn primary lg block" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export function LogoutButton({ to, className = 'btn sm' }: { to: string; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const portal = to.startsWith('/admin') ? 'admin' : to.startsWith('/kitchen') ? 'kitchen' : to.startsWith('/rider') ? 'rider' : 'customer';
        await fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ portal }) }).catch(() => {});
        window.location.assign(to);
      }}
    >
      Sign out
    </button>
  );
}
