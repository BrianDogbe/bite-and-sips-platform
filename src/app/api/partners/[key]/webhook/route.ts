import { NextResponse } from '@/server/response';
import { handlePartnerWebhook } from '@/server/fulfillment/partners';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const raw = await req.text();
  if (raw.length > 256 * 1024) return NextResponse.json({ error: 'too large' }, { status: 413 });
  const r = await handlePartnerWebhook(key, raw, req.headers);
  return NextResponse.json(r.body, { status: r.httpStatus });
}
