import { getCurrentUser } from '@/server/auth/current';
import { handler } from '@/server/http';
import { requireAnyPerm } from '@/server/auth/guard';
import { toCsv, periodToUtc } from '@/server/reporting';
import { getSettings } from '@/server/settings';
import { sql } from '@/server/db';
import { localDateKey } from '@/lib/time';
import { audit } from '@/server/audit';
import { invalid, forbidden } from '@/server/errors';

export const dynamic = 'force-dynamic';

/** CSV exports. Orders export includes customer contact only for staff with customers.view. */
export const GET = handler(async (req: Request) => {
  const user = requireAnyPerm(await getCurrentUser(), ['reports.view', 'finance.view']);
  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const tz = (await getSettings('restaurant')).timezone;
  const today = localDateKey(new Date(), tz);
  const fromKey = url.searchParams.get('from') || localDateKey(new Date(Date.now() - 29 * 86400_000), tz);
  const toKey = url.searchParams.get('to') || today;
  const { from, to } = periodToUtc(fromKey, toKey, tz);
  let rows: Record<string, unknown>[];
  if (type === 'orders') {
    const contact = user.permissions.has('customers.view');
    rows = await sql`
      select o.order_number, o.created_at, o.placed_at, o.status, o.payment_status, o.payment_method, o.fulfillment_type, o.kitchen_status, f.status as fulfillment_status,
             o.customer_name, o.customer_phone,
             o.subtotal_pesewas::numeric / 100 as subtotal_ghs, o.discount_pesewas::numeric / 100 as discount_ghs, o.delivery_fee_pesewas::numeric / 100 as delivery_fee_ghs,
             o.service_charge_pesewas::numeric / 100 as service_charge_ghs, o.tax_pesewas::numeric / 100 as tax_ghs, o.total_pesewas::numeric / 100 as total_ghs,
             o.refunded_pesewas::numeric / 100 as refunded_ghs, o.is_test
      from orders o join fulfillments f on f.order_id = o.id
      where o.created_at >= ${from} and o.created_at < ${to} order by o.created_at`;
    if (!contact) rows = rows.map((r) => ({ ...r, customerName: String(r.customerName ?? '').split(' ')[0], customerPhone: '' }));
  } else if (type === 'payments') {
    if (!user.permissions.has('payments.view')) throw forbidden();
    rows = await sql`
      select a.reference, o.order_number, a.provider, a.channel, a.status, a.amount_pesewas::numeric / 100 as amount_ghs, a.fees_pesewas::numeric / 100 as fees_ghs,
             a.paid_at, a.reconciliation_status, a.settled_amount_pesewas::numeric / 100 as settled_ghs, o.is_test
      from payment_attempts a join orders o on o.id = a.order_id
      where a.created_at >= ${from} and a.created_at < ${to} order by a.created_at`;
  } else throw invalid('Unknown export type.');
  await audit(sql, { userId: user.id, label: 'staff' }, 'export.downloaded', 'export', type, { fromKey, toKey, rows: rows.length });
  return new Response('﻿' + toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bite-and-sips-${type}-${fromKey}-to-${toKey}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
