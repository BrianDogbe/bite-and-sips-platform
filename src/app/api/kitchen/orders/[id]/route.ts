import { NextResponse } from 'next/server';
import { handler, noStore, readJson, assertSameOrigin } from '@/server/http';
import { getCurrentUser } from '@/server/auth/current';
import { kitchenAction, markPickupCollected } from '@/server/orders/lifecycle';
import { invalid } from '@/server/errors';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const b = (await readJson(req)) as { action?: string; note?: string };
  const user = await getCurrentUser();
  if (b.action === 'collected') {
    await markPickupCollected(user, id, { note: b.note });
  } else if (b.action === 'accept' || b.action === 'start' || b.action === 'ready' || b.action === 'recall') {
    await kitchenAction(user, id, b.action, { note: b.note?.slice(0, 300) });
  } else throw invalid('Unknown action.');
  return NextResponse.json({ ok: true }, { headers: noStore });
});
