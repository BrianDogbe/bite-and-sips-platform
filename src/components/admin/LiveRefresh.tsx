'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeRealtime } from '@/lib/realtime-client';
import { C_LIVE_PILL } from '@/components/ui';

/** Re-renders the current server page when relevant data changes (SSE), with a polling fallback. */
export function LiveRefresh({ topics, pollMs = 30000 }: { topics: string[]; pollMs?: number }) {
  const router = useRouter();
  const [at, setAt] = useState<number>(Date.now());
  const [live, setLive] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const refresh = () => {
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => {
        router.refresh();
        setAt(Date.now());
      }, 400);
    };
    const unsubscribe = subscribeRealtime({ topics, onReady: () => setLive(true), onChange: refresh, onDown: () => setLive(false) });
    const poll = setInterval(refresh, pollMs);
    return () => {
      unsubscribe();
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics.join(','), pollMs]);
  return (
    // Same wording as the Dispatch pill; the time is visible because tablets can't show a hover title.
    <span className={`${C_LIVE_PILL} ${live ? '' : 'stale'}`} role="status" suppressHydrationWarning>
      <span className="dot" aria-hidden="true" /> {live ? 'Live' : `Last updated ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
    </span>
  );
}
