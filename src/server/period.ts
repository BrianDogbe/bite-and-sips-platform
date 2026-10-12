import 'server-only';
import { localDateKey } from '@/lib/time';
import { periodToUtc } from './reporting';

/** Parse ?from=&to= (local dates) with a default of the last 7 days including today. */
export function resolvePeriod(sp: { from?: string; to?: string }, tz: string, defaultDays = 7) {
  const today = localDateKey(new Date(), tz);
  const start = localDateKey(new Date(Date.now() - (defaultDays - 1) * 86400_000), tz);
  const fromKey = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : start;
  const toKey = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : today;
  const { from, to } = periodToUtc(fromKey, toKey, tz);
  return { fromKey, toKey, from, to, today };
}
