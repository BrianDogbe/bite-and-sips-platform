import { NextResponse } from '@/server/response';
import { handler, assertSameOrigin, clientIp, readJson, noStore } from '@/server/http';
import { login } from '@/server/auth/sessions';
import { setSessionCookie, asPortal } from '@/server/auth/current';
import { invalid } from '@/server/errors';
import type { Role } from '@/server/auth/permissions';

export const dynamic = 'force-dynamic';

const PORTAL_ROLES: Record<string, Role[]> = {
  admin: ['owner', 'manager'],
  kitchen: ['owner', 'manager', 'kitchen'],
  rider: ['owner', 'rider'],
  customer: ['customer'],
};

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const b = (await readJson(req)) as { identifier?: string; password?: string; portal?: string };
  if (!b.identifier || !b.password) throw invalid('Enter your email/phone and password.');
  const portal = String(b.portal ?? 'customer');
  const r = await login(String(b.identifier), String(b.password), {
    ip: clientIp(req.headers),
    userAgent: req.headers.get('user-agent'),
    requireAnyRole: PORTAL_ROLES[portal] ?? PORTAL_ROLES.customer,
  });
  await setSessionCookie(r.token, r.expiresAt, asPortal(portal) ?? 'customer');
  return NextResponse.json({ ok: true, roles: r.roles }, { headers: noStore });
});
