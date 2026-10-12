import { NextResponse } from 'next/server';
import { handler, readJson, noStore, clientIp } from '@/server/http';
import { quote } from '@/server/pricing';
import { quoteRequestSchema } from '@/lib/validation';
import { invalid } from '@/server/errors';
import { enforceRateLimit } from '@/server/auth/rate-limit';

export const dynamic = 'force-dynamic';

/** Authoritative price check for the cart (display); the order endpoint re-prices again. */
export const POST = handler(async (req: Request) => {
  await enforceRateLimit(`quote:${clientIp(req.headers)}`, 120, 60);
  const p = quoteRequestSchema.safeParse(await readJson(req));
  if (!p.success) throw invalid('Invalid cart.', p.error.flatten());
  const q = await quote(p.data);
  return NextResponse.json(q, { headers: noStore });
});
