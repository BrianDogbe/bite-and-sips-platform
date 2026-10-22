import { redirect } from 'next/navigation';
import Link from 'next/link';
import { sql } from '@/server/db';
import { verifyReference } from '@/server/payments/service';
import { log } from '@/server/log';

export const dynamic = 'force-dynamic';

/**
 * The payment provider redirects here after checkout. We never trust the redirect itself:
 * the payment is verified server-side with the provider before the tracking page shows it as paid.
 */
export default async function PaymentReturn({ searchParams }: { searchParams: Promise<{ reference?: string | string[]; trxref?: string | string[] }> }) {
  const sp = await searchParams;
  // Paystack appends its own reference/trxref to our callback address, so a name can arrive twice (an array).
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const reference = (first(sp.reference) || first(sp.trxref)).slice(0, 80);
  const [row] = reference ? await sql<{ trackingToken: string }[]>`select o.tracking_token from payment_attempts a join orders o on o.id = a.order_id where a.reference = ${reference}` : [];
  if (!row) {
    return (
      <div className="wrap section">
        <h1>We couldn’t find that payment</h1>
        <p>If money left your account, contact us with your order number and we’ll check it for you.</p>
        <Link className="btn primary" href="/track">
          Find my order
        </Link>
      </div>
    );
  }
  try {
    await verifyReference(reference, { userId: null, label: 'return_redirect' });
  } catch (e) {
    // Verification can be retried from the tracking page / by the webhook and reconciliation job.
    log.warn('payment_return_verify_failed', { reference, error: String(e) });
  }
  redirect(`/track/${row.trackingToken}?from=payment`);
}
