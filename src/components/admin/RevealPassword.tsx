'use client';
import { useState } from 'react';

/** Password input with a Show/Hide toggle so a temporary password can be read before it is shared. */
export function RevealPassword({ id, name = 'password', placeholder, label }: { id?: string; name?: string; placeholder?: string; label?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="reveal-pw">
      <input id={id} name={name} type={show ? 'text' : 'password'} className="input" minLength={10} required placeholder={placeholder} aria-label={label} autoComplete="new-password" />
      <button type="button" className="reveal-btn" onClick={() => setShow((s) => !s)} aria-pressed={show}>
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
