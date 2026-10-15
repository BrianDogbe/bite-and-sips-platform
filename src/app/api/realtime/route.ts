import { getCurrentUser } from '@/server/auth/current';
import { bus, ensureListening } from '@/server/realtime';
import { authorizeTopics } from '@/server/realtime-auth';
import { log } from '@/server/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Server-Sent Events stream of change signals. Subscriptions are authorised per topic:
 *   kitchen  → kitchen.operate / kitchen.monitor
 *   dispatch → dispatch.manage
 *   admin    → dashboard.view
 *   rider    → the signed-in rider's own topic
 *   order    → requires the order's secret tracking token (?token=…)
 * Payloads never contain personal data; clients re-fetch through authorised endpoints.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const want = (url.searchParams.get('topics') ?? '').split(',').filter(Boolean).slice(0, 5);
  const user = await getCurrentUser();
  const topics = await authorizeTopics(user, want, url.searchParams.get('token'));
  if (topics.size === 1 && want.length) return new Response('Forbidden', { status: 403 });

  try {
    await ensureListening();
  } catch {
    return new Response('Realtime unavailable', { status: 503 });
  }

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          cleanup();
        }
      };
      send(`retry: 3000\nevent: ready\ndata: ${JSON.stringify({ topics: [...topics].map((t) => t.split(':')[0]) })}\n\n`);
      const onEvent = (msg: { topic: string; kind?: string }) => {
        if (topics.has(msg.topic)) send(`event: change\ndata: ${JSON.stringify({ topic: msg.topic.split(':')[0], kind: msg.kind ?? null })}\n\n`);
      };
      bus().on('event', onEvent);
      const ping = setInterval(() => send(`: ping ${Date.now()}\n\n`), 20000);
      cleanup = () => {
        clearInterval(ping);
        bus().off('event', onEvent);
      };
      req.signal.addEventListener('abort', () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup();
      log.debug('sse_closed');
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
