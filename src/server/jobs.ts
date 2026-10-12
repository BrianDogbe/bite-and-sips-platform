import 'server-only';
import { sql, type Db } from './db';
import { expireUnpaidOrders, syncPendingPayments, syncPendingRefunds } from './payments/service';
import { dispatchQueuedNotifications } from './notifications';
import { purgeOldLocations } from './fulfillment/inhouse';
import { purgeRateLimits } from './auth/rate-limit';
import { purgeExpiredSessions } from './auth/sessions';
import { log } from './log';

/**
 * Background maintenance. Run every minute via:
 *   - an external scheduler calling POST /api/cron/run with `Authorization: Bearer $CRON_SECRET`, or
 *   - `npm run jobs:run` from a system cron / scheduled task.
 * Each job is idempotent and safe to run concurrently with itself.
 */
export async function runJobs(db: Db = sql) {
  const results: Record<string, unknown> = {};
  const jobs: [string, () => Promise<unknown>][] = [
    ['syncPendingPayments', () => syncPendingPayments(db)],
    ['expireUnpaidOrders', () => expireUnpaidOrders(new Date(), db)],
    ['syncPendingRefunds', () => syncPendingRefunds(db)],
    ['dispatchNotifications', () => dispatchQueuedNotifications(50, db)],
    ['purgeOldLocations', () => purgeOldLocations(db)],
    ['purgeRateLimits', () => purgeRateLimits(db)],
    ['purgeSessions', () => purgeExpiredSessions(db)],
  ];
  for (const [name, fn] of jobs) {
    try {
      results[name] = await fn();
    } catch (e) {
      results[name] = { error: e instanceof Error ? e.message : String(e) };
      log.error('job_failed', { job: name, error: String(e) });
    }
  }
  return results;
}
