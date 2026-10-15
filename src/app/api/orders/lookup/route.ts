import { NextResponse } from '@/server/response';
import { handler, assertSameOrigin, clientIp, readJson, noStore } from '@/server/http';
import { lookupGuestOrder } from '@/server/orders/queries';
import { invalid } from '@/server/errors';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const b = (await readJson(req)) as { orderNumber?: string; phone?: string };
  if (!b.orderNumber || !b.phone) throw invalid('Enter your order number and phone number.');
  const token = await lookupGuestOrder(String(b.orderNumber), String(b.phone), clientIp(req.headers));
  return NextResponse.json({ token }, { headers: noStore });
});
