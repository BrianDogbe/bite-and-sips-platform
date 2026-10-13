'use client';
import { useEffect, useState, useTransition } from 'react';
import type { ActionResult } from '@/lib/action-result';

/** One-click server action with optional confirmation and inline result. */
export function ActionButton({ action, children, className = 'btn', confirm }: { action: () => Promise<ActionResult>; children: React.ReactNode; className?: string; confirm?: string }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult | null>(null);
  useEffect(() => {
    if (!res?.ok) return;
    const t = setTimeout(() => setRes(null), 4000);
    return () => clearTimeout(t);
  }, [res]);
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button
        type="button"
        className={className}
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => setRes(await action()));
        }}
      >
        {pending ? <span className="spinner" aria-hidden="true" /> : null} {children}
      </button>
      <span role="status" aria-live="polite" className="small">
        {res && !res.ok && <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{res.error}</span>}
        {res && res.ok && res.message && <span style={{ color: 'var(--ok)', fontWeight: 700 }}>{res.message}</span>}
      </span>
    </span>
  );
}
