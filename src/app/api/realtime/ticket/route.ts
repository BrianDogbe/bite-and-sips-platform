import { NextResponse } from '@/server/response';
import { handler, noStore, readJson, assertSameOrigin, clientIp } from '@/server/http';
import { getCurrentUser } from '@/server/auth/current';
import { authorizeTopics, signTicket } from '@/server/realtime-auth';
import { enforceRateLimit } from '@/server/auth/rate-limit';

export const dynamic = 'force-dynamic';

/** Issues a short-lived ticket for the WebSocket server, listing only the topics this caller is allowed to join. */
export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  await enforceRateLimit(`rt-ticket:${clientIp(req.headers)}`, 60, 60);
  const b = (await readJson(req, 2048)) as { topics?: unknown; token?: unknown };
  const want = Array.isArray(b.topics) ? b.topics.filter((x): x is string => typeof x === 'string').slice(0, 5) : [];
  const token = typeof b.token === 'string' ? b.token : null;
  const topics = await authorizeTopics(await getCurrentUser(), want, token);
  if (topics.size === 1 && want.length && !token) return NextResponse.json({ error: { code: 'forbidden', message: 'Not allowed.' } }, { status: 403, headers: noStore });
  return NextResponse.json({ ticket: signTicket([...topics]), topics: [...topics].map((t) => t.split(':')[0]) }, { headers: noStore });
});
