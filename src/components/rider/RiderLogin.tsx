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
      className="grid [gap:16px] [&_.field_label]:font-bold"
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
      <div className="flex items-center [gap:14px] [font-size:.85rem] [letter-spacing:.06em] [color:var(--muted)] [&::before]:[content:''] [&::before]:flex-1 [&::before]:[height:1px] [&::before]:[background:var(--line)] [&::after]:[content:''] [&::after]:flex-1 [&::after]:[height:1px] [&::after]:[background:var(--line)]"><span>LOG IN</span></div>
      <div className="grid [grid-template-columns:1fr_1fr] [gap:4px] [padding:4px] [background:var(--ivory-2)] [border-radius:12px] [&_button]:[padding:11px_8px] [&_button]:border-0 [&_button]:[border-radius:9px] [&_button]:bg-transparent [&_button]:[font:inherit] [&_button]:[color:var(--muted)] [&_button]:cursor-pointer [&_button[aria-selected=true]]:[background:#fff] [&_button[aria-selected=true]]:[color:var(--ink)] [&_button[aria-selected=true]]:[box-shadow:0_1px_3px_rgba(53,_37,_31,_.15)]" role="tablist" aria-label="Sign in with">
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
        <div className="relative [&_.input]:[padding-right:72px]">
          <input id="rl-pw" className="input" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} required maxLength={200} />
          <button type="button" className="absolute [right:8px] [top:50%] [transform:translateY(-50%)] [background:none] border-0 [padding:6px_8px] [font:inherit] [&]:[font-size:.85rem] [&]:font-semibold [color:var(--sage-dark)] cursor-pointer [border-radius:8px] hover:[background:var(--sage-tint)]" onClick={() => setShow((s) => !s)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
        </div>
      </div>
      {err && <p className="alert error" role="alert">{err}</p>}
      <button type="submit" className="btn primary lg block" disabled={busy || !id || !pw}>
        {busy ? 'Signing in…' : 'Continue →'}
      </button>
      <p className="m-0 text-center [font-size:.92rem] [color:var(--muted)]">Forgot password? Ask the restaurant to reset it.</p>
    </form>
  );
}
