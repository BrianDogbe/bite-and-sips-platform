import { NextResponse } from 'next/server';
import { handler, noStore, readJson, assertSameOrigin } from '@/server/http';
import { getCurrentUser } from '@/server/auth/current';
import { kitchenAction, kitchenDecline, markPickupCollected } from '@/server/orders/lifecycle';
import { assignRider } from '@/server/fulfillment/inhouse';
import { invalid } from '@/server/errors';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const b = (await readJson(req)) as { action?: string; note?: string; riderId?: string };
  const user = await getCurrentUser();
  if (b.action === 'collected') {
    await markPickupCollected(user, id, { note: b.note });
  } else if (b.action === 'assign') {
    if (!b.riderId) throw invalid('Choose a rider.');
    await assignRider(user, { orderId: id, riderUserId: b.riderId, reason: 'Assigned from the kitchen' });
  } else if (b.action === 'decline') {
    if (!b.note?.trim()) throw invalid('Give a reason for declining.');
    await kitchenDecline(user, id, b.note.slice(0, 300));
  } else if (b.action === 'accept' || b.action === 'start' || b.action === 'ready' || b.action === 'recall') {
    await kitchenAction(user, id, b.action, { note: b.note?.slice(0, 300) });
  } else throw invalid('Unknown action.');
  return NextResponse.json({ ok: true }, { headers: noStore });
});
