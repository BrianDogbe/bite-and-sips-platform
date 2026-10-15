import { NextResponse } from '@/server/response';
import { handler, noStore, readJson, assertSameOrigin } from '@/server/http';
import { getCurrentUser } from '@/server/auth/current';
import { raiseException } from '@/server/ops';
import { invalid } from '@/server/errors';

export const dynamic = 'force-dynamic';

const KINDS = ['kitchen_delay', 'kitchen_issue', 'delivery_issue', 'payment_issue', 'other'] as const;

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const b = (await readJson(req)) as { orderId?: string; kind?: string; message?: string };
  if (!KINDS.includes(b.kind as (typeof KINDS)[number])) throw invalid('Unknown issue type.');
  const id = await raiseException(await getCurrentUser(), { orderId: b.orderId ?? null, kind: b.kind as (typeof KINDS)[number], message: String(b.message ?? '') });
  return NextResponse.json({ ok: true, id }, { headers: noStore });
});
