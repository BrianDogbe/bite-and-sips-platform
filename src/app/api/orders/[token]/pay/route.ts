import { NextResponse } from '@/server/response';
import { handler, assertSameOrigin, clientIp, noStore } from '@/server/http';
import { startPayment } from '@/server/payments/service';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request, ctx: { params: Promise<{ token: string }> }) => {
  assertSameOrigin(req);
  const { token } = await ctx.params;
  return NextResponse.json(await startPayment(token, { ip: clientIp(req.headers) }), { headers: noStore });
});
