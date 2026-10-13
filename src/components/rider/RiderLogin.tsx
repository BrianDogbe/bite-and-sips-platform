'use client';
import { useState } from 'react';
import { postJson } from '@/lib/use-live';

/** Rider sign-in: choose email or phone, enter it with the password, continue. */
export function RiderLogin({ next }: { next: string }) {
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="rl-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await postJson('/api/auth/login', { identifier: id, password: pw, portal: 'rider' });
          try {
            sessionStorage.setItem('bs-tab-rider', '1');
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
      <div className="rl-divider"><span>LOG IN</span></div>
      <div className="rl-toggle" role="tablist" aria-label="Sign in with">
        <button type="button" role="tab" aria-selected={mode === 'email'} onClick={() => { setMode('email'); setId(''); }}>Email</button>
        <button type="button" role="tab" aria-selected={mode === 'phone'} onClick={() => { setMode('phone'); setId(''); }}>Phone number</button>
      </div>
      <div className="field">
        <label htmlFor="rl-id">{mode === 'email' ? 'Rider email' : 'Rider phone number'}</label>
        <input
          id="rl-id"
          className="input"
          type={mode === 'email' ? 'email' : 'tel'}
          inputMode={mode === 'email' ? 'email' : 'tel'}
          autoComplete={mode === 'email' ? 'email' : 'tel'}
          placeholder={mode === 'email' ? 'Email' : 'Phone number'}
          value={id}
          onChange={(e) => setId(e.target.value)}
          required
          maxLength={120}
        />
      </div>
      <div className="field">
        <label htmlFor="rl-pw">Password</label>
        <div className="reveal-pw">
          <input id="rl-pw" className="input" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} required maxLength={200} />
          <button type="button" className="reveal-btn" onClick={() => setShow((s) => !s)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
        </div>
      </div>
      {err && <p className="alert error" role="alert">{err}</p>}
      <button type="submit" className="btn primary lg block" disabled={busy || !id || !pw}>
        {busy ? 'Signing in…' : 'Continue →'}
      </button>
      <p className="rl-forgot">Forgot password? Ask the restaurant to reset it.</p>
    </form>
  );
}
