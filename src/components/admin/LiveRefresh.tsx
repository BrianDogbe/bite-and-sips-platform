'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeRealtime } from '@/lib/realtime-client';

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
    <span className={`live-pill ${live ? '' : 'stale'}`} role="status" title={new Date(at).toLocaleTimeString()}>
      <span className="dot" aria-hidden="true" /> {live ? 'Live' : 'Auto-refresh'}
    </span>
  );
}
