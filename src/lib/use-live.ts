'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type LiveStatus = 'connecting' | 'live' | 'polling' | 'offline';

/**
 * Keep a screen in sync with the server:
 *  - subscribes to /api/realtime (Server-Sent Events) for change signals,
 *  - re-fetches the full state on every signal AND on (re)connect, so missed events are recovered,
 *  - falls back to polling when the stream is unavailable,
 *  - exposes `lastSuccess` so the UI can say when data is stale.
 * The server remains the source of truth; nothing is kept in localStorage.
 */
export function useLive<T>(opts: { url: string; topics?: string[]; token?: string; pollMs?: number; initial?: T | null; enabled?: boolean }) {
  const { url, topics = [], token, pollMs = 15000, initial = null, enabled = true } = opts;
  const [data, setData] = useState<T | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [lastSuccess, setLastSuccess] = useState<number | null>(initial ? Date.now() : null);
  const inflight = useRef<AbortController | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    inflight.current?.abort();
    const ac = new AbortController();
    inflight.current = ac;
    try {
      const res = await fetch(url, { cache: 'no-store', signal: ac.signal, headers: { accept: 'application/json' } });
      if (res.status === 401 || res.status === 403) {
        setError('Your session has ended. Please sign in again.');
        return;
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      setData(body as T);
      setError(null);
      setLastSuccess(Date.now());
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError(navigator.onLine === false ? 'You are offline. Showing the last loaded information.' : 'Could not refresh. Retrying…');
    }
  }, [url]);

  const schedule = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void refresh(), 250);
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    const qs = new URLSearchParams();
    if (topics.length) qs.set('topics', topics.join(','));
    if (token) qs.set('token', token);
    const startPolling = () => {
      if (!poll) poll = setInterval(() => void refresh(), pollMs);
    };
    if (typeof EventSource !== 'undefined') {
      es = new EventSource(`/api/realtime?${qs}`);
      es.addEventListener('ready', () => {
        setStatus('live');
        schedule(); // recover anything missed while disconnected
      });
      es.addEventListener('change', () => schedule());
      es.onerror = () => {
        setStatus(navigator.onLine === false ? 'offline' : 'polling');
        startPolling();
      };
    } else {
      setStatus('polling');
    }
    // Always keep a slow safety poll even when live.
    const safety = setInterval(() => void refresh(), Math.max(pollMs * 2, 30000));
    startPolling();
    const onOnline = () => {
      setStatus('connecting');
      void refresh();
    };
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      es?.close();
      if (poll) clearInterval(poll);
      clearInterval(safety);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      inflight.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, token, topics.join(','), pollMs, enabled]);

  return { data, setData, error, status, lastSuccess, refresh };
}

/** POST JSON helper returning the parsed body or throwing an Error with the server's message. */
export async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error?.message ?? `Request failed (${res.status})`) as Error & { status?: number; details?: unknown; code?: string };
    err.status = res.status;
    err.details = json?.error?.details;
    err.code = json?.error?.code;
    throw err;
  }
  return json as T;
}
