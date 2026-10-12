import { NextResponse } from 'next/server';
import { handler, assertSameOrigin, clientIp, readJson, noStore } from '@/server/http';
import { registerCustomer } from '@/server/staff';
import { setSessionCookie } from '@/server/auth/current';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const b = (await readJson(req)) as { fullName?: string; email?: string; phone?: string; password?: string };
  const r = await registerCustomer(
    { fullName: String(b.fullName ?? ''), email: String(b.email ?? ''), phone: String(b.phone ?? ''), password: String(b.password ?? '') },
    { ip: clientIp(req.headers), userAgent: req.headers.get('user-agent') },
  );
  await setSessionCookie(r.token, r.expiresAt);
  return NextResponse.json({ ok: true }, { status: 201, headers: noStore });
});
