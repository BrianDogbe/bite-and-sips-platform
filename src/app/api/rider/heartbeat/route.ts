import { NextResponse } from '@/server/response';
import { handler, noStore, readJson, assertSameOrigin } from '@/server/http';
import { getCurrentUser } from '@/server/auth/current';
import { riderHeartbeat } from '@/server/fulfillment/inhouse';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const b = (await readJson(req)) as { onDuty?: boolean };
  await riderHeartbeat(await getCurrentUser(), !!b.onDuty);
  return NextResponse.json({ ok: true, at: new Date().toISOString() }, { headers: noStore });
});
