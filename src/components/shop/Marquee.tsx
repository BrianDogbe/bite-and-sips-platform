'use client';
import { useState, type ReactNode } from 'react';

/** Scrolling banner strip that pauses while it is pressed or touched (hover pausing is handled in CSS by the caller). */
export function Marquee({ className, children }: { className: string; children: ReactNode }) {
  const [held, setHeld] = useState(false);
  const release = () => setHeld(false);
  return (
    <div className={className} data-held={held || undefined} onPointerDown={() => setHeld(true)} onPointerUp={release} onPointerCancel={release} onPointerLeave={release} aria-hidden="true">
      {children}
    </div>
  );
}
