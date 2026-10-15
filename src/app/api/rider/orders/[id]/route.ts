import { NextResponse } from '@/server/response';
import { handler, noStore, readJson, assertSameOrigin } from '@/server/http';
import { getCurrentUser } from '@/server/auth/current';
import { riderRespond, riderAdvance, confirmDeliveryWithPin, failDelivery } from '@/server/fulfillment/inhouse';
import { recordCashCollected } from '@/server/orders/lifecycle';
import { invalid } from '@/server/errors';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const b = (await readJson(req)) as { action?: string; reason?: string; pin?: string; amountPesewas?: number };
  switch (b.action) {
    case 'accept':
    case 'decline':
      await riderRespond(user, id, b.action, b.reason ?? null);
      break;
    case 'at_restaurant':
    case 'picked_up':
    case 'on_the_way':
    case 'arrived':
      await riderAdvance(user, id, b.action);
      break;
    case 'deliver':
      await confirmDeliveryWithPin(user, id, String(b.pin ?? ''));
      break;
    case 'fail':
      await failDelivery(user, id, String(b.reason ?? ''));
      break;
    case 'cash':
      await recordCashCollected(user, id, Number(b.amountPesewas));
      break;
    default:
      throw invalid('Unknown action.');
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
});
