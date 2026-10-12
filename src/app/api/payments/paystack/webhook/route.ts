import { NextResponse } from 'next/server';
import { handlePaymentWebhook } from '@/server/payments/service';
import { log } from '@/server/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Paystack webhook. Configure https://<your-domain>/api/payments/paystack/webhook in the Paystack dashboard. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 512 * 1024) return NextResponse.json({ error: 'too large' }, { status: 413 });
  try {
    const r = await handlePaymentWebhook('paystack', raw, req.headers);
    return NextResponse.json(r.body, { status: r.httpStatus });
  } catch (e) {
    log.error('paystack_webhook_error', { error: String(e) });
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
