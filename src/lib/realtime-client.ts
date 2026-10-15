'use client';

/**
 * Browser side of the realtime channel. Uses WebSockets (Socket.IO, served by the separate backend) when
 * NEXT_PUBLIC_SOCKET_URL is set, and falls back to the Next.js Server-Sent-Events stream otherwise.
 * Either way the server only sends tiny "something changed" signals; screens re-fetch through the normal API.
 */
export interface RealtimeHandlers {
  onReady?: () => void;
  onChange: () => void;
  onDown?: () => void;
}

export function subscribeRealtime(opts: { topics: string[]; token?: string | null } & RealtimeHandlers): () => void {
  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
  let closed = false;
  let cleanup = () => {};

  if (socketUrl) {
    void (async () => {
      try {
        const { io } = await import('socket.io-client');
        if (closed) return;
        const socket = io(socketUrl, {
          transports: ['websocket', 'polling'],
          reconnectionDelay: 1000,
          reconnectionDelayMax: 10000,
          // A fresh signed ticket on every (re)connect: it lists exactly the topics this browser may join.
          auth: (cb: (data: object) => void) => {
            fetch('/api/realtime/ticket', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ topics: opts.topics, token: opts.token ?? undefined }),
              cache: 'no-store',
            })
              .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
              .then((j: { ticket: string }) => cb({ ticket: j.ticket }))
              .catch(() => cb({ ticket: '' })); // server rejects → connect_error → polling fallback in the caller
          },
        });
        socket.on('ready', () => opts.onReady?.());
        socket.on('change', () => opts.onChange());
        socket.on('connect_error', () => opts.onDown?.());
        socket.on('disconnect', () => opts.onDown?.());
        cleanup = () => socket.close();
        if (closed) cleanup();
      } catch {
        opts.onDown?.();
      }
    })();
  } else if (typeof EventSource !== 'undefined') {
    const qs = new URLSearchParams();
    if (opts.topics.length) qs.set('topics', opts.topics.join(','));
    if (opts.token) qs.set('token', opts.token);
    const es = new EventSource(`/api/realtime?${qs}`);
    es.addEventListener('ready', () => opts.onReady?.());
    es.addEventListener('change', () => opts.onChange());
    es.onerror = () => opts.onDown?.();
    cleanup = () => es.close();
  } else {
    opts.onDown?.();
  }

  return () => {
    closed = true;
    cleanup();
  };
}
