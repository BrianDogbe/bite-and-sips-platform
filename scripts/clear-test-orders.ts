/**
 * Removes test orders (and what hangs off them) from the database, ready for launch.
 *
 * SAFE BY DEFAULT: with no --confirm it only SHOWS what it would remove and deletes nothing.
 * It only touches orders placed BEFORE the cutoff you give, so orders placed after launch are never affected.
 *
 * Preview:   npx tsx scripts/clear-test-orders.ts --before "2026-11-01 09:00"
 * Delete:    npx tsx scripts/clear-test-orders.ts --before "2026-11-01 09:00" --confirm 14
 *            (the number after --confirm must equal the number of orders shown in the preview)
 *
 * The cutoff is read as Accra time (UTC+0) and must not be in the future.
 *
 * Removed: those orders with their items, history, payments, refunds, fulfilments, delivery assignments, partner bookings,
 *          notifications and the support cases tied to them; payment webhook logs, mock-payment records, rider GPS points and rider
 *          cash hand-ins recorded before the cutoff; promotion usage counts are recalculated.
 * Kept:    menu, staff and customer accounts, settings, delivery zones, promotions, stock levels and the audit log.
 *          If you track stock, recount it afterwards: orders that used stock leave the stock movements in place.
 */
import postgres from 'postgres';
import { loadDotEnv } from './load-env';

loadDotEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

function parseCutoff(s: string | undefined): Date {
  const m = s?.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?$/);
  if (!m) {
    console.error('Give a cutoff like --before "2026-11-01 09:00" (Accra time) or --before 2026-11-01');
    process.exit(1);
  }
  const d = new Date(`${m[1]}T${m[2] ?? '00:00'}:00Z`); // Accra is UTC+0
  if (Number.isNaN(d.getTime())) {
    console.error('That date is not valid.');
    process.exit(1);
  }
  if (d.getTime() > Date.now()) {
    console.error('The cutoff is in the future. Use a time that has already passed, so no live orders can be affected.');
    process.exit(1);
  }
  return d;
}

const ghs = (p: number) => `GH₵${(p / 100).toFixed(2)}`;

async function main() {
  const cutoff = parseCutoff(arg('before'));
  const confirm = arg('confirm');
  const sql = postgres(url!, { max: 1, onnotice: () => {} });
  try {
    const orders = await sql<{ id: string; order_number: string; created_at: Date; total_pesewas: number; status: string; payment_method: string }[]>`
      select id, order_number, created_at, total_pesewas, status, payment_method from orders where created_at < ${cutoff} order by created_at`;
    const kept = await sql<{ n: number }[]>`select count(*)::int as n from orders where created_at >= ${cutoff}`;

    console.log(`Cutoff: orders placed before ${cutoff.toISOString().replace('T', ' ').slice(0, 16)} (Accra time).`);
    console.log(`Orders that would be removed: ${orders.length}`);
    console.log(`Orders that stay (placed at or after the cutoff): ${kept[0].n}`);
    if (!orders.length) return;
    const total = orders.reduce((a, o) => a + o.total_pesewas, 0);
    console.log(`Combined value of the removed orders: ${ghs(total)}`);
    console.log(`First: ${orders[0].order_number} (${orders[0].created_at.toISOString().slice(0, 16).replace('T', ' ')})   Last: ${orders[orders.length - 1].order_number} (${orders[orders.length - 1].created_at.toISOString().slice(0, 16).replace('T', ' ')})`);
    const byDay = new Map<string, number>();
    for (const o of orders) byDay.set(o.created_at.toISOString().slice(0, 10), (byDay.get(o.created_at.toISOString().slice(0, 10)) ?? 0) + 1);
    console.log('By day: ' + [...byDay].map(([d, n]) => `${d}: ${n}`).join(', '));
    const real = orders.filter((o) => o.status === 'completed' && o.created_at.getTime() > Date.now() - 24 * 3600_000).length;
    if (real) console.log(`NOTE: ${real} of these were completed in the last 24 hours. Check the cutoff is right before deleting.`);

    if (confirm === undefined) {
      console.log('\nNothing was deleted. To delete these orders, run the same command with:  --confirm ' + orders.length);
      return;
    }
    if (Number(confirm) !== orders.length) {
      console.error(`\nNothing deleted: --confirm ${confirm} does not match the ${orders.length} orders above. Check the preview and use --confirm ${orders.length}.`);
      process.exit(1);
    }

    await sql.begin(async (t) => {
      const ids = orders.map((o) => o.id);
      const refs = await t<{ reference: string }[]>`select reference from payment_attempts where order_id in ${t(ids)}`;
      const refList = refs.map((r) => r.reference);
      await t`delete from refunds where order_id in ${t(ids)}`;
      if (refList.length) {
        await t`delete from mock_refunds where reference in ${t(refList)}`;
        await t`delete from mock_transactions where reference in ${t(refList)}`;
      }
      await t`delete from payment_attempts where order_id in ${t(ids)}`;
      await t`delete from webhook_events where received_at < ${cutoff}`;
      await t`delete from support_cases where order_id in ${t(ids)}`;
      await t`delete from rider_locations where recorded_at < ${cutoff} or order_id in ${t(ids)}`;
      await t`delete from rider_cash_handovers where received_at < ${cutoff}`;
      await t`delete from orders where id in ${t(ids)}`;
      await t`update promotions set used_count = (select count(*) from promotion_redemptions r where r.promotion_id = promotions.id and r.voided_at is null)`;
    });
    console.log(`\nDone: ${orders.length} test orders removed.`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
