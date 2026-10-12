import { NextResponse } from 'next/server';
import { handler, noStore, readJson, assertSameOrigin } from '@/server/http';
import { getCurrentUser } from '@/server/auth/current';
import { setItemAvailability } from '@/server/menu-admin';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const b = (await readJson(req)) as { available?: boolean; reason?: string };
  await setItemAvailability(await getCurrentUser(), Number(id), !!b.available, b.reason?.slice(0, 120) ?? null);
  return NextResponse.json({ ok: true }, { headers: noStore });
});
