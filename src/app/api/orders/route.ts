import { NextResponse } from '@/server/response';
import { handler, readJson, assertSameOrigin, clientIp, noStore } from '@/server/http';
import { createOrder } from '@/server/orders/create';
import { startPayment } from '@/server/payments/service';
import { getCurrentUser } from '@/server/auth/current';
import { isDomainError } from '@/server/errors';

export const dynamic = 'force-dynamic';

/**
 * Create an order (idempotent on idempotencyKey). For online payment the response includes the
 * provider checkout URL; if payment initialisation fails the order remains awaiting payment and the
 * customer can retry from the tracking page.
 */
export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const ip = clientIp(req.headers);
  const user = await getCurrentUser();
  const body = await readJson(req);
  const order = await createOrder(body, { user, ip });
  let authorizationUrl: string | null = null;
  let paymentError: string | null = null;
  if (order.paymentMethod === 'online' && order.status === 'pending_payment') {
    try {
      const p = await startPayment(order.trackingToken, { ip });
      authorizationUrl = p.authorizationUrl ?? null;
    } catch (e) {
      paymentError = isDomainError(e) ? e.message : 'We could not start the payment.';
    }
  }
  return NextResponse.json({ ...order, authorizationUrl, paymentError }, { status: order.duplicate ? 200 : 201, headers: noStore });
});
