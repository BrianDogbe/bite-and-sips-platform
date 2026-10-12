/**
 * Run background maintenance once (payment reconciliation, expiring unpaid orders, refund sync,
 * notification dispatch, location/session purge). Schedule every minute with cron / Task Scheduler,
 * or call POST /api/cron/run with the CRON_SECRET instead.
 */
import { loadDotEnv } from './load-env';
loadDotEnv();

async function main() {
  const { runJobs } = await import('../src/server/jobs');
  const { closeSql } = await import('../src/server/db');
  const r = await runJobs();
  console.log(JSON.stringify({ t: new Date().toISOString(), jobs: r }));
  await closeSql();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
