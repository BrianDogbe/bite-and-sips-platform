import { NextResponse } from '@/server/response';
import { handler, noStore } from '@/server/http';
import { getCurrentUser } from '@/server/auth/current';
import { reorderLines } from '@/server/orders/queries';
import { unauthenticated } from '@/server/errors';

export const dynamic = 'force-dynamic';

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ orderId: string }> }) => {
  const user = await getCurrentUser();
  if (!user) throw unauthenticated();
  const { orderId } = await ctx.params;
  return NextResponse.json({ lines: await reorderLines(user, orderId) }, { headers: noStore });
});
