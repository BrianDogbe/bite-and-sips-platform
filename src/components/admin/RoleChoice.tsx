'use client';
import { useEffect, useRef, useState } from 'react';

/** One role per person: once a role is ticked the others are unavailable until it is unticked. */
export function RoleChoice({ options, selected = [] }: { options: { value: string; label: string; locked?: boolean }[]; selected?: string[] }) {
  const [sel, setSel] = useState<string[]>(selected);
  const box = useRef<HTMLDivElement>(null);
  // When the surrounding form is reset (e.g. after creating an account) go back to the starting choice.
  useEffect(() => {
    const form = box.current?.closest('form');
    if (!form) return;
    const onReset = () => setSel(selected);
    form.addEventListener('reset', onReset);
    return () => form.removeEventListener('reset', onReset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="staff-checks" ref={box}>
      {options.map((o) => {
        const on = sel.includes(o.value);
        const blocked = o.locked || (sel.length > 0 && !on);
        return (
          <label key={o.value} className="check check-card small" aria-disabled={blocked}>
            <input
              type="checkbox"
              name="roles"
              value={o.value}
              checked={on}
              disabled={blocked}
              onChange={(e) => setSel((s) => (e.target.checked ? [...s, o.value] : s.filter((v) => v !== o.value)))}
            />{' '}
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
