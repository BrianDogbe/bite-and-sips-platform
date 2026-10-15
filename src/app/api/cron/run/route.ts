import { NextResponse } from '@/server/response';
import { env } from '@/server/env';
import { runJobs } from '@/server/jobs';
import { safeEqualStr } from '@/server/ids';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Background jobs trigger. Call every minute with `Authorization: Bearer $CRON_SECRET`. */
async function run(req: Request) {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || !safeEqualStr(auth, `Bearer ${secret}`)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, results: await runJobs() });
}
export const POST = run;
export const GET = run; // some schedulers (e.g. Vercel Cron) use GET
