import { NextResponse } from '@/server/response';
import { handler, noStore, readJson, assertSameOrigin } from '@/server/http';
import { getCurrentUser } from '@/server/auth/current';
import { recordRiderLocation } from '@/server/fulfillment/inhouse';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const r = await recordRiderLocation(await getCurrentUser(), await readJson(req, 4096));
  return NextResponse.json(r, { headers: noStore });
});
