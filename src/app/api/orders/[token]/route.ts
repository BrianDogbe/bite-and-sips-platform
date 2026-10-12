import { NextResponse } from 'next/server';
import { handler, noStore, clientIp } from '@/server/http';
import { trackingView } from '@/server/orders/queries';
import { enforceRateLimit } from '@/server/auth/rate-limit';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request, ctx: { params: Promise<{ token: string }> }) => {
  await enforceRateLimit(`track:${clientIp(req.headers)}`, 240, 60);
  const { token } = await ctx.params;
  return NextResponse.json(await trackingView(token), { headers: noStore });
});
