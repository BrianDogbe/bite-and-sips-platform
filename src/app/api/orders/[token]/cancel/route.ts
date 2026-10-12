import { NextResponse } from 'next/server';
import { handler, assertSameOrigin, clientIp, readJson, noStore } from '@/server/http';
import { customerCancelByToken } from '@/server/orders/lifecycle';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request, ctx: { params: Promise<{ token: string }> }) => {
  assertSameOrigin(req);
  const { token } = await ctx.params;
  const body = (await readJson(req)) as { reason?: string };
  const r = await customerCancelByToken(token, String(body.reason ?? '').slice(0, 300), clientIp(req.headers));
  return NextResponse.json({ ok: true, alreadyCancelled: r.alreadyCancelled, refundStarted: r.needsRefund }, { headers: noStore });
});
