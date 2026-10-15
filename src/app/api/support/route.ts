import { NextResponse } from '@/server/response';
import { handler, assertSameOrigin, clientIp, readJson, noStore } from '@/server/http';
import { openSupportCase } from '@/server/support';
import { getCurrentUser } from '@/server/auth/current';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const r = await openSupportCase(await readJson(req), { user: await getCurrentUser(), ip: clientIp(req.headers) });
  return NextResponse.json(r, { status: 201, headers: noStore });
});
