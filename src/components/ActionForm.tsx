'use client';
import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionResult } from '@/lib/action-result';

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/**
 * Form bound to a server action. Shows the server's success / error message (in an aria-live
 * region) and only reports success after the server confirms it.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  confirm,
  onSuccess,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
  onSuccess?: (r: ActionResult) => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <div aria-live="polite" role="status">
        {state && !state.ok && <p className="alert error" style={{ marginTop: 10 }}>{state.error}</p>}
        {state && state.ok && state.message && <p className="alert ok" style={{ marginTop: 10 }}>{state.message}</p>}
      </div>
    </form>
  );
}

export function SubmitButton({ children, className = 'btn primary', pendingText }: { children: ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? (
        <>
          <span className="spinner" aria-hidden="true" /> {pendingText ?? 'Saving…'}
        </>
      ) : (
        children
      )}
    </button>
  );
}
