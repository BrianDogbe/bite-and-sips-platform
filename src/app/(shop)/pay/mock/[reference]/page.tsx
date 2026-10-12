import { notFound } from 'next/navigation';
import { sql } from '@/server/db';
import { env } from '@/server/env';
import { formatGHS } from '@/lib/money';
import { simulateMockPayment } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Test payment', robots: { index: false } };

export default async function MockPayPage({ params }: { params: Promise<{ reference: string }> }) {
  const e = env();
  if (e.PAYMENT_PROVIDER !== 'mock' || (e.NODE_ENV === 'production' && e.ALLOW_MOCK_PAYMENTS_IN_PRODUCTION !== 'true')) notFound();
  const { reference } = await params;
  const [tx] = await sql<{ amountPesewas: number; status: string; email: string | null }[]>`select amount_pesewas, status, email from mock_transactions where reference = ${reference}`;
  if (!tx) notFound();
  const act = (o: 'success' | 'failed' | 'abandoned' | 'pending') => simulateMockPayment.bind(null, reference, o);
  return (
    <div className="wrap section" style={{ maxWidth: 560 }}>
      <div className="panel stack">
        <p className="badge warn plain">Simulated payment page: no money moves</p>
        <h1 style={{ fontSize: '1.8rem' }}>Pay {formatGHS(tx.amountPesewas)}</h1>
        <p className="muted">
          This page stands in for the payment provider while the site runs in test mode. Choose what the customer does. Approving sends a signed webhook into the same verification code the live provider uses.
        </p>
        <dl className="kv">
          <dt>Reference</dt>
          <dd>{reference}</dd>
          <dt>Receipt email</dt>
          <dd>{tx.email ?? 'None'}</dd>
          <dt>Status</dt>
          <dd>{tx.status}</dd>
        </dl>
        {tx.status === 'pending' ? (
          <div className="stack">
            <form action={act('success')}>
              <button className="btn primary lg block">Approve payment</button>
            </form>
            <form action={act('failed')}>
              <button className="btn lg block">Decline payment</button>
            </form>
            <form action={act('pending')}>
              <button className="btn ghost block">Leave pending (like an unanswered Mobile Money prompt)</button>
            </form>
            <form action={act('abandoned')}>
              <button className="btn ghost block">Close without paying</button>
            </form>
          </div>
        ) : (
          <form action={act('pending')}>
            <button className="btn primary block">Back to the order</button>
          </form>
        )}
      </div>
    </div>
  );
}
