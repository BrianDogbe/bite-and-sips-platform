'use client';
import { useState } from 'react';

/** Password input with a Show/Hide toggle so a temporary password can be read before it is shared. */
export function RevealPassword({ id, name = 'password', placeholder, label }: { id?: string; name?: string; placeholder?: string; label?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative [&_.input]:[padding-right:72px]">
      <input id={id} name={name} type={show ? 'text' : 'password'} className="input" minLength={10} required placeholder={placeholder} aria-label={label} autoComplete="new-password" />
      <button type="button" className="absolute [right:8px] [top:50%] [transform:translateY(-50%)] [background:none] border-0 [padding:6px_8px] [font:inherit] [&]:[font-size:.85rem] [&]:font-semibold [color:var(--sage-dark)] cursor-pointer [border-radius:8px] hover:[background:var(--sage-tint)]" onClick={() => setShow((s) => !s)} aria-pressed={show}>
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
