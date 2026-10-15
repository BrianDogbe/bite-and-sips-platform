import { NextResponse } from '@/server/response';
import { handler, assertSameOrigin, noStore, readJson } from '@/server/http';
import { revokeSession, SESSION_COOKIES } from '@/server/auth/sessions';
import { clearSessionCookie, asPortal, requestPortal, getRequestCookie } from '@/server/auth/current';

export const dynamic = 'force-dynamic';

/** Signs out of ONE portal only (the others stay signed in). */
export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  let bodyPortal: string | undefined;
  try {
    bodyPortal = ((await readJson(req, 1024)) as { portal?: string }).portal;
  } catch {
    /* no body */
  }
  const portal = asPortal(bodyPortal) ?? (await requestPortal()) ?? 'customer';
  const token = await getRequestCookie(SESSION_COOKIES[portal]);
  if (token) await revokeSession(token);
  await clearSessionCookie(portal);
  return NextResponse.json({ ok: true }, { headers: noStore });
});
